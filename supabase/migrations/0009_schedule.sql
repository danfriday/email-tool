-- =====================================================================
--  Backstop schedule for the queue worker (pg_cron + pg_net + Vault).
--
--  Why this exists: the Next.js worker self-triggers after each enqueue,
--  but on Netlify a function is frozen once it returns its response, so the
--  self-chain can't keep draining. This every-minute cron is the reliable
--  pacing + safety net that, even with nobody using the app:
--    - starts SCHEDULED campaigns when their time arrives
--    - retries jobs whose backoff has elapsed
--    - recovers jobs stuck in `processing`
--    - drains ~one batch (~8s of sending) per tick
--
--  Secrets are read from Supabase Vault at each tick, so nothing sensitive
--  is written into this file. You set them once in STEP 1 below.
--
--  HOW TO RUN (Supabase Dashboard -> SQL Editor):
--    1. Edit the two values in STEP 1 (your Netlify URL + service-role key).
--    2. Run this whole file. Re-running is safe (idempotent).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------
--  STEP 1 — store config in Vault.  *** EDIT THESE TWO VALUES ***
--    worker_site_url   : your deployed origin, NO trailing slash
--                        e.g. https://praise-party.netlify.app
--    worker_cron_secret: your SUPABASE_SERVICE_ROLE_KEY (same value the app
--                        uses; it doubles as the cron auth secret).
--  Re-running updates the stored values in place.
-- ---------------------------------------------------------------------
do $$
declare
  v_url    text := 'https://YOUR-SITE.netlify.app';      -- <-- EDIT
  v_secret text := 'YOUR_SUPABASE_SERVICE_ROLE_KEY';     -- <-- EDIT
  v_id uuid;
begin
  v_url := rtrim(v_url, '/');

  select id into v_id from vault.secrets where name = 'worker_site_url';
  if v_id is null then
    perform vault.create_secret(v_url, 'worker_site_url', 'Queue worker base URL (no trailing slash)');
  else
    perform vault.update_secret(v_id, v_url);
  end if;

  select id into v_id from vault.secrets where name = 'worker_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'worker_cron_secret', 'Queue worker auth = SUPABASE_SERVICE_ROLE_KEY');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;

-- ---------------------------------------------------------------------
--  STEP 2 — (re)schedule the worker. Idempotent.
-- ---------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('process-email-queue');
exception when others then null;
end $$;

-- Kick the worker route once a minute. Each tick claims a batch, sends for
-- ~8s, then returns; the next minute's tick continues until the queue drains.
select cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_site_url')
               || '/api/cron/process-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- =====================================================================
--  Inspect / manage:
--    select * from cron.job;                                   -- is it scheduled?
--    select * from cron.job_run_details order by start_time desc limit 20;
--    select * from net._http_response order by created desc limit 20;  -- worker replies
--    select cron.unschedule('process-email-queue');            -- stop it
--    select name from vault.secrets where name like 'worker_%'; -- confirm secrets set
-- =====================================================================

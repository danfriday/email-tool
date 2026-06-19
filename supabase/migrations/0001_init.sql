-- =====================================================================
--  Bulk Email Platform — core schema
--  Run in the Supabase SQL editor (or via `supabase db push`).
--  Idempotent: safe to re-run.
-- =====================================================================

-- ---- Extensions ------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive email
create extension if not exists "pg_trgm";     -- fast ILIKE / fuzzy search

-- ---- updated_at helper ----------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
--  CONTACTS
--  Email is the natural unique key. Hard bounces / complaints set a
--  global `suppressed` flag so a bad address is never mailed again,
--  across every campaign.
-- =====================================================================
create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default '',
  email             citext not null unique,
  suppressed        boolean not null default false,
  suppressed_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Upgrade a pre-existing `contacts` table (e.g. the old single-table schema)
-- to the current shape without dropping data. All steps are idempotent.
alter table contacts add column if not exists name              text not null default '';
alter table contacts add column if not exists suppressed        boolean not null default false;
alter table contacts add column if not exists suppressed_reason text;
alter table contacts add column if not exists created_at        timestamptz not null default now();
alter table contacts add column if not exists updated_at        timestamptz not null default now();
alter table contacts alter column name set default '';
-- Make email case-insensitive if it was created as plain text previously.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'contacts' and column_name = 'email' and data_type <> 'USER-DEFINED'
  ) then
    execute 'alter table contacts alter column email type citext using lower(email)';
  end if;
end $$;
-- Old per-contact send columns (status/sent_at) are no longer used; delivery
-- state now lives in email_jobs. They are harmless if left in place.

create index if not exists contacts_created_at_idx on contacts (created_at desc);
create index if not exists contacts_suppressed_idx on contacts (suppressed) where suppressed;
-- Trigram indexes power server-side search on large tables.
create index if not exists contacts_name_trgm_idx  on contacts using gin (name gin_trgm_ops);
create index if not exists contacts_email_trgm_idx on contacts using gin ((email::text) gin_trgm_ops);

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();

-- =====================================================================
--  CONTACT LISTS (segments) — many-to-many with contacts
-- =====================================================================
create table if not exists contact_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists contact_lists_name_unique
  on contact_lists (lower(name));

drop trigger if exists contact_lists_set_updated_at on contact_lists;
create trigger contact_lists_set_updated_at before update on contact_lists
  for each row execute function set_updated_at();

create table if not exists contact_list_members (
  list_id    uuid not null references contact_lists (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create index if not exists clm_contact_idx on contact_list_members (contact_id);
create index if not exists clm_list_idx    on contact_list_members (list_id);

-- =====================================================================
--  CAMPAIGNS
--  A campaign is one send run against a chosen recipient set. The email
--  body is the fixed template (template_name); per-recipient delivery is
--  tracked in email_jobs.
-- =====================================================================
do $$ begin
  create type campaign_status as enum
    ('draft','scheduled','queued','processing','paused','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  template_name    text not null default 'praise-party',
  from_name        text not null default 'Praise Party 3.0',
  from_email       text not null default 'noreply@resend.dev',
  flyer_image_url  text,
  status           campaign_status not null default 'draft',
  scheduled_at     timestamptz,
  total_recipients integer not null default 0,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

create index if not exists campaigns_status_idx     on campaigns (status);
create index if not exists campaigns_created_at_idx  on campaigns (created_at desc);
create index if not exists campaigns_scheduled_idx
  on campaigns (scheduled_at) where status = 'scheduled';

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at before update on campaigns
  for each row execute function set_updated_at();

-- =====================================================================
--  EMAIL JOBS — the persistent, durable queue
--  One row per (campaign, contact). The worker claims rows with
--  FOR UPDATE SKIP LOCKED so many invocations never double-send.
-- =====================================================================
do $$ begin
  create type job_status as enum
    ('queued','processing','sent','failed','retrying','skipped','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists email_jobs (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns (id) on delete cascade,
  contact_id      uuid references contacts (id) on delete set null,
  email           citext not null,
  name            text not null default '',
  status          job_status not null default 'queued',
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  last_error      text,
  message_id      text,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (campaign_id, contact_id)
);

-- The hot path: "give me due, claimable work".
create index if not exists email_jobs_claim_idx
  on email_jobs (next_attempt_at)
  where status in ('queued','retrying');
create index if not exists email_jobs_campaign_idx on email_jobs (campaign_id);
create index if not exists email_jobs_status_idx    on email_jobs (status);
-- Find stuck rows for recovery.
create index if not exists email_jobs_locked_idx
  on email_jobs (locked_at) where status = 'processing';

drop trigger if exists email_jobs_set_updated_at on email_jobs;
create trigger email_jobs_set_updated_at before update on email_jobs
  for each row execute function set_updated_at();

-- =====================================================================
--  ACTIVITY LOG — emails, campaigns, imports, auth, admin actions, errors
-- =====================================================================
create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,            -- email|campaign|import|job|auth|admin|system|error
  level       text not null default 'info', -- info|warn|error
  message     text not null,
  metadata    jsonb,
  campaign_id uuid references campaigns (id) on delete set null,
  contact_id  uuid references contacts (id) on delete set null,
  actor       text,
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on activity_logs (created_at desc);
create index if not exists activity_logs_type_idx       on activity_logs (type, created_at desc);
create index if not exists activity_logs_campaign_idx   on activity_logs (campaign_id);

-- =====================================================================
--  CAMPAIGN PROGRESS — live aggregate counts for the dashboard
-- =====================================================================
create or replace view campaign_progress as
select
  c.id,
  c.name,
  c.status,
  c.template_name,
  c.from_name,
  c.from_email,
  c.scheduled_at,
  c.created_at,
  c.started_at,
  c.completed_at,
  c.total_recipients,
  count(j.*)                                              as job_count,
  count(*) filter (where j.status = 'sent')              as sent,
  count(*) filter (where j.status = 'failed')            as failed,
  count(*) filter (where j.status = 'skipped')           as skipped,
  count(*) filter (where j.status in ('queued','retrying','processing')) as pending,
  case
    when count(j.*) = 0 then 0
    else round(
      100.0 * count(*) filter (where j.status in ('sent','failed','skipped'))
      / count(j.*)
    )
  end as completion_pct
from campaigns c
left join email_jobs j on j.campaign_id = c.id
group by c.id;

-- =====================================================================
--  WORKER RPCs
-- =====================================================================

-- Atomically claim a batch of due jobs for processing. Only claims jobs
-- whose campaign is actively sending. SKIP LOCKED makes it safe to run
-- many workers / overlapping cron ticks concurrently.
create or replace function claim_email_jobs(p_batch_size int, p_worker_id text)
returns setof email_jobs
language plpgsql as $$
begin
  return query
  update email_jobs j
     set status    = 'processing',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = j.attempts + 1
   where j.id in (
     select j2.id
       from email_jobs j2
       join campaigns c on c.id = j2.campaign_id
      where j2.status in ('queued','retrying')
        and j2.next_attempt_at <= now()
        and c.status in ('queued','processing','scheduled')
      order by j2.next_attempt_at
      limit p_batch_size
      for update of j2 skip locked
   )
  returning j.*;
end;
$$;

-- Requeue jobs that have been "processing" too long (worker died mid-send).
create or replace function recover_stuck_jobs(p_older_than_minutes int default 10)
returns int
language plpgsql as $$
declare n int;
begin
  with reset as (
    update email_jobs
       set status = 'retrying',
           locked_at = null,
           locked_by = null,
           next_attempt_at = now(),
           last_error = coalesce(last_error,'') || ' [recovered: stuck processing]'
     where status = 'processing'
       and locked_at < now() - make_interval(mins => p_older_than_minutes)
    returning 1
  )
  select count(*) into n from reset;
  return coalesce(n, 0);
end;
$$;

-- Move scheduled campaigns whose time has arrived into the active queue,
-- and mark fully-drained campaigns completed. Called each worker tick.
create or replace function reconcile_campaigns()
returns void
language plpgsql as $$
begin
  -- Scheduled -> queued when due.
  update campaigns
     set status = 'queued', started_at = coalesce(started_at, now())
   where status = 'scheduled'
     and scheduled_at is not null
     and scheduled_at <= now();

  -- Active campaign with no remaining work -> completed.
  update campaigns c
     set status = 'completed', completed_at = now()
   where c.status in ('queued','processing')
     and not exists (
       select 1 from email_jobs j
        where j.campaign_id = c.id
          and j.status in ('queued','retrying','processing')
     );
end;
$$;

-- =====================================================================
--  ROW LEVEL SECURITY
--  All access goes through the Next.js server using the service-role key
--  (which bypasses RLS). We enable RLS with NO policies so a leaked anon
--  key grants zero table access.
-- =====================================================================
alter table contacts             enable row level security;
alter table contact_lists        enable row level security;
alter table contact_list_members enable row level security;
alter table campaigns            enable row level security;
alter table email_jobs           enable row level security;
alter table activity_logs        enable row level security;

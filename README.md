# Bulk Email Platform

A production-oriented bulk email manager: import contacts at scale, segment
them into lists, and send template-based campaigns through a **durable,
server-side queue** that keeps sending even after the admin closes the browser.

Built with **Next.js 14** (Netlify) + **Supabase** (Postgres, Auth, Edge
Functions, pg_cron) + **Resend**.

## Architecture

```
 Browser (admin UI)                Netlify (Next.js)                 Supabase
 ─────────────────                 ─────────────────                 ────────
  Dashboard / Contacts   ── API ──►  Route handlers      ── SQL ──►  Postgres
  Lists / Campaigns / Logs           (auth + validation)             ├─ contacts / lists
        ▲                                                            ├─ campaigns
        │ live polling                                               ├─ email_jobs (queue)
        └──────────────────────────────────────────────┐           └─ activity_logs
                                                         │
                            pg_cron (every minute) ──────┴──► Edge Function `process-queue`
                                                                   claims jobs (SKIP LOCKED)
                                                                   → Resend (retry/backoff)
                                                                   → updates statuses + logs
```

The browser **never sends email**. It only enqueues a campaign; the Supabase
Edge Function — woken by pg_cron — drains the `email_jobs` queue. Closing the
tab, refreshing, or losing connectivity has no effect on delivery.

### Key properties
- **Scalable contacts** — server-side pagination, trigram-indexed search,
  set-based bulk import that dedupes on a unique index. Handles 100k+ rows.
- **Segments** — many-to-many lists; a contact can belong to many lists.
- **Campaigns** — draft / schedule / queue / pause / resume / cancel /
  duplicate, with live progress (sent / pending / failed / skipped / %).
- **Durable queue** — `FOR UPDATE SKIP LOCKED` claiming, exponential backoff,
  stuck-job recovery, global suppression of hard bounces/complaints.
- **Security** — Supabase Auth on every route, locked-down RLS, input
  sanitization, rate limiting, signed Resend webhook.

## Setup

### 1. Database
Run the migrations in order in the Supabase SQL editor (or `supabase db push`):
```
supabase/migrations/0001_init.sql      -- tables, indexes, RLS, worker RPCs
supabase/migrations/0002_enqueue.sql   -- recipient enqueue RPCs
supabase/migrations/0009_schedule.sql  -- pg_cron schedule (edit placeholders!)
```
In `0009_schedule.sql` replace `<PROJECT_REF>` and `<WORKER_SECRET>` first
(run it after deploying the Edge Function in step 2).

### 2. The worker

Default (no deploy, reuses your existing app env): the worker runs as the
Next.js route `app/api/cron/process-queue`. After a campaign is enqueued the
app pings it and it **self-chains** until the queue drains, so sending
continues server-side even if the browser closes. It authenticates with
`x-cron-secret` = your `SUPABASE_SERVICE_ROLE_KEY`. Nothing extra to configure.

Then add the pg_cron backstop in `0009_schedule.sql` (starts scheduled
campaigns, retries, and recovers stuck jobs when no admin is online) — replace
`<YOUR_SITE_URL>` and `<SERVICE_ROLE_KEY>` and run it.

Alternative: the Supabase Edge Function in `supabase/functions/process-queue`
does the same job inside Supabase. It requires the CLI + its own secrets
(`supabase functions deploy process-queue --no-verify-jwt`,
`supabase secrets set RESEND_API_KEY=... FROM_EMAIL=... FROM_NAME=... FLYER_IMAGE_URL=... WORKER_SECRET=...`).
Use it only if you prefer the worker to live in Supabase rather than Netlify.

### 3. Admin user
Create one in the Supabase dashboard (Authentication → Users → Add user), or
enable email sign-in. The app has no public sign-up — admins are provisioned
in Supabase.

### 4. App env
Copy `.env.example` → `.env.local` (and into Netlify env vars). Keep
`SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` server-side only.

### 5. Run / deploy
```
npm install
npm run dev          # local
npm run build        # Netlify build command, publish dir: .next
```

### Resend webhook (recommended)
Point a Resend webhook at `https://<domain>/api/webhooks/resend`, subscribe to
`email.bounced` and `email.complained`, and set
`RESEND_WEBHOOK_SIGNING_SECRET` (preferred) or `RESEND_WEBHOOK_TOKEN`.
Suppressed addresses are skipped on every future send.

## Project layout
```
app/                      Next.js app router (UI + API routes)
  api/contacts|lists|campaigns|logs|dashboard|import|webhooks|flyer
components/                UI tabs (Dashboard, Contacts, Lists, Campaigns, Logs)
lib/
  services/                DB access (contacts, lists, campaigns, logs)
  supabaseAdmin.ts         service-role client (server only)
  supabaseServer/Browser   auth-aware clients
  auth.ts / validation.ts / logger.ts / rateLimit.ts
middleware.ts              auth gate + rate limiting
supabase/
  migrations/              SQL schema, RPCs, pg_cron schedule
  functions/process-queue  Deno Edge Function worker
```

## License
MIT

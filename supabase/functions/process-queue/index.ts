// =====================================================================
//  process-queue — the decoupled email worker (Supabase Edge Function)
//
//  Invoked every minute by pg_cron (see supabase/migrations/0002_schedule.sql)
//  and also callable on-demand by the app right after a campaign is queued
//  for instant pickup. Either way, sending runs entirely server-side and
//  continues regardless of what any browser does.
//
//  Each invocation:
//    1. reconciles campaigns (scheduled -> queued, drained -> completed)
//    2. recovers jobs stuck in `processing` (a previous worker died)
//    3. claims due jobs in batches (FOR UPDATE SKIP LOCKED, no double-send)
//    4. sends via Resend with rate-limiting + exponential backoff
//    5. records per-job status and writes activity logs
//
//  Deploy:  supabase functions deploy process-queue --no-verify-jwt
//  Secrets: supabase secrets set RESEND_API_KEY=... FROM_EMAIL=... \
//             FROM_NAME=... WORKER_SECRET=... FLYER_IMAGE_URL=...
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailTemplate, interpolate } from "./template.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@resend.dev";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Praise Party 3.0";
const FLYER_IMAGE_URL = Deno.env.get("FLYER_IMAGE_URL") ?? "";
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const SEND_DELAY_MS = Number(Deno.env.get("RESEND_SEND_DELAY_MS")) || 600;

const BATCH_SIZE = 20;          // jobs claimed per loop
const MAX_RUNTIME_MS = 50_000;  // stop before the platform timeout
const WORKER_ID = crypto.randomUUID();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type ErrorKind = "rate" | "permanent" | "transient";

function classifyError(message: string): ErrorKind {
  const m = (message || "").toLowerCase();
  if (m.includes("rate") || m.includes("429") || m.includes("too many")) return "rate";
  if (
    m.includes("invalid") || m.includes("not a valid") || m.includes("validation") ||
    m.includes("bounce") || m.includes("suppress") || m.includes("blocked") ||
    m.includes("does not exist") || m.includes("unknown recipient") || m.includes("no such user")
  ) return "permanent";
  return "transient";
}

interface Job {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  name: string;
  attempts: number;
  max_attempts: number;
}

interface Campaign {
  id: string;
  template_name: string;
  from_name: string;
  from_email: string;
  flyer_image_url: string | null;
}

async function log(
  type: string,
  level: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  try {
    await db.from("activity_logs").insert({
      type, level, message,
      campaign_id: extra.campaign_id ?? null,
      contact_id: extra.contact_id ?? null,
      actor: "worker",
      metadata: extra,
    });
  } catch (_) { /* logging must never break the worker */ }
}

async function sendViaResend(opts: {
  from: string; to: string; subject: string; html: string; text: string;
}): Promise<{ id?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.message || `Resend ${res.status}`);
  }
  return { id: data?.id };
}

async function processJob(job: Job, campaign: Campaign): Promise<void> {
  // Skip if the contact has been globally suppressed (hard bounce/complaint).
  if (job.contact_id) {
    const { data: contact } = await db
      .from("contacts").select("suppressed").eq("id", job.contact_id).single();
    if (contact?.suppressed) {
      await db.from("email_jobs").update({
        status: "skipped", last_error: "Contact suppressed", locked_at: null, locked_by: null,
      }).eq("id", job.id);
      return;
    }
  }

  const tpl = getEmailTemplate(campaign.template_name);
  const flyer = campaign.flyer_image_url || FLYER_IMAGE_URL;
  const rendered = interpolate(tpl, job.name || job.email, job.email, flyer);
  const fromName = campaign.from_name || FROM_NAME;
  const fromEmail = campaign.from_email || FROM_EMAIL;

  try {
    const { id } = await sendViaResend({
      from: `${fromName} <${fromEmail}>`,
      to: job.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await db.from("email_jobs").update({
      status: "sent", message_id: id ?? null, sent_at: new Date().toISOString(),
      last_error: null, locked_at: null, locked_by: null,
    }).eq("id", job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown send error";
    const kind = classifyError(msg);

    if (kind === "permanent") {
      await db.from("email_jobs").update({
        status: "failed", last_error: msg, locked_at: null, locked_by: null,
      }).eq("id", job.id);
      // Globally suppress a hard-bouncing address so no campaign retries it.
      if (job.contact_id) {
        await db.from("contacts").update({
          suppressed: true, suppressed_reason: `send failed: ${msg}`.slice(0, 500),
        }).eq("id", job.contact_id);
      }
      await log("email", "warn", `Permanent failure → ${job.email}: ${msg}`, {
        campaign_id: job.campaign_id, contact_id: job.contact_id,
      });
      return;
    }

    // Transient / rate-limited: retry with exponential backoff, else give up.
    if (job.attempts >= job.max_attempts) {
      await db.from("email_jobs").update({
        status: "failed", last_error: msg, locked_at: null, locked_by: null,
      }).eq("id", job.id);
      await log("email", "error", `Exhausted retries → ${job.email}: ${msg}`, {
        campaign_id: job.campaign_id, contact_id: job.contact_id,
      });
    } else {
      const backoffMs = Math.min(SEND_DELAY_MS * 2 ** job.attempts, 60_000);
      const next = new Date(Date.now() + backoffMs).toISOString();
      await db.from("email_jobs").update({
        status: "retrying", last_error: msg, next_attempt_at: next,
        locked_at: null, locked_by: null,
      }).eq("id", job.id);
    }
  }
}

async function run(): Promise<{ processed: number; sent: number }> {
  const start = Date.now();
  let processed = 0;
  let sent = 0;

  // Housekeeping before draining.
  await db.rpc("reconcile_campaigns");
  await db.rpc("recover_stuck_jobs", { p_older_than_minutes: 10 });

  const campaignCache = new Map<string, Campaign>();

  while (Date.now() - start < MAX_RUNTIME_MS) {
    const { data: jobs, error } = await db.rpc("claim_email_jobs", {
      p_batch_size: BATCH_SIZE,
      p_worker_id: WORKER_ID,
    });
    if (error) {
      await log("job", "error", `claim_email_jobs failed: ${error.message}`);
      break;
    }
    if (!jobs || jobs.length === 0) break; // queue drained

    for (const job of jobs as Job[]) {
      if (Date.now() - start >= MAX_RUNTIME_MS) break;

      let campaign = campaignCache.get(job.campaign_id);
      if (!campaign) {
        const { data } = await db.from("campaigns")
          .select("id, template_name, from_name, from_email, flyer_image_url")
          .eq("id", job.campaign_id).single();
        if (!data) {
          await db.from("email_jobs").update({
            status: "cancelled", last_error: "Campaign missing",
            locked_at: null, locked_by: null,
          }).eq("id", job.id);
          continue;
        }
        campaign = data as Campaign;
        campaignCache.set(job.campaign_id, campaign);
      }

      await processJob(job, campaign);
      processed++;
      await sleep(SEND_DELAY_MS); // pace under Resend's rate limit
    }
  }

  // Mark drained campaigns complete.
  await db.rpc("reconcile_campaigns");
  if (processed > 0) {
    await log("job", "info", `Worker tick processed ${processed} job(s)`, { processed, sent });
  }
  return { processed, sent };
}

Deno.serve(async (req: Request) => {
  // Authenticate the invocation (cron sets x-worker-secret; the app forwards it too).
  if (WORKER_SECRET) {
    const provided = req.headers.get("x-worker-secret");
    if (provided !== WORKER_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await run();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await log("job", "error", `Worker crashed: ${msg}`);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getEmailTemplate, interpolate } from '@/lib/emailTemplate';
import { logActivity } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reuses your existing env — no new variables required.
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@resend.dev';
const FROM_NAME = process.env.FROM_NAME ?? 'Praise Party 3.0';
const FLYER_IMAGE_URL =
  process.env.FLYER_IMAGE_URL || process.env.NEXT_PUBLIC_FLYER_IMAGE_URL || '';
const SEND_DELAY_MS = Number(process.env.RESEND_SEND_DELAY_MS) || 600;

// Stop well before Netlify's function timeout (~10s default), then self-chain.
// Total throughput is gated by SEND_DELAY_MS, not by this window.
const MAX_RUNTIME_MS = 8_000;
const BATCH_SIZE = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ErrorKind = 'rate' | 'permanent' | 'transient';
function classifyError(message: string): ErrorKind {
  const m = (message || '').toLowerCase();
  if (m.includes('rate') || m.includes('429') || m.includes('too many')) return 'rate';
  if (
    m.includes('invalid') || m.includes('not a valid') || m.includes('validation') ||
    m.includes('bounce') || m.includes('suppress') || m.includes('blocked') ||
    m.includes('does not exist') || m.includes('unknown recipient') || m.includes('no such user')
  ) return 'permanent';
  return 'transient';
}

interface Job {
  id: string; campaign_id: string; contact_id: string | null;
  email: string; name: string; attempts: number; max_attempts: number;
}
interface Campaign {
  id: string; template_name: string; from_name: string;
  from_email: string; flyer_image_url: string | null;
}

async function sendViaResend(opts: {
  from: string; to: string; subject: string; html: string; text: string;
}): Promise<{ id?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.message || data?.error?.message || `Resend ${res.status}`);
  return { id: data?.id };
}

async function processJob(db: any, job: Job, campaign: Campaign): Promise<void> {
  if (job.contact_id) {
    const { data: contact } = await db.from('contacts').select('suppressed').eq('id', job.contact_id).single();
    if (contact?.suppressed) {
      await db.from('email_jobs').update({ status: 'skipped', last_error: 'Contact suppressed', locked_at: null, locked_by: null }).eq('id', job.id);
      return;
    }
  }

  const tpl = getEmailTemplate(campaign.template_name);
  const flyer = campaign.flyer_image_url || FLYER_IMAGE_URL;
  const rendered = interpolate(tpl, job.name || job.email, job.email, flyer);

  try {
    const { id } = await sendViaResend({
      from: `${campaign.from_name || FROM_NAME} <${campaign.from_email || FROM_EMAIL}>`,
      to: job.email,
      subject: rendered.subject, html: rendered.html, text: rendered.text,
    });
    await db.from('email_jobs').update({
      status: 'sent', message_id: id ?? null, sent_at: new Date().toISOString(),
      last_error: null, locked_at: null, locked_by: null,
    }).eq('id', job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown send error';
    const kind = classifyError(msg);

    if (kind === 'permanent') {
      await db.from('email_jobs').update({ status: 'failed', last_error: msg, locked_at: null, locked_by: null }).eq('id', job.id);
      if (job.contact_id) {
        await db.from('contacts').update({ suppressed: true, suppressed_reason: `send failed: ${msg}`.slice(0, 500) }).eq('id', job.contact_id);
      }
      return;
    }
    if (job.attempts >= job.max_attempts) {
      await db.from('email_jobs').update({ status: 'failed', last_error: msg, locked_at: null, locked_by: null }).eq('id', job.id);
    } else {
      const backoffMs = Math.min(SEND_DELAY_MS * 2 ** job.attempts, 60_000);
      await db.from('email_jobs').update({
        status: 'retrying', last_error: msg,
        next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
        locked_at: null, locked_by: null,
      }).eq('id', job.id);
    }
  }
}

async function drain(workerId: string): Promise<{ processed: number; drained: boolean }> {
  const db = getAdminClient();
  const start = Date.now();
  let processed = 0;
  let drained = false;

  await db.rpc('reconcile_campaigns');
  await db.rpc('recover_stuck_jobs', { p_older_than_minutes: 10 });

  const campaignCache = new Map<string, Campaign>();

  while (Date.now() - start < MAX_RUNTIME_MS) {
    // Claim only as many jobs as we can actually send before the time budget
    // runs out (each send costs ~SEND_DELAY_MS). Over-claiming is what strands
    // jobs in `processing`; right-sizing the batch prevents that at the source.
    const remaining = MAX_RUNTIME_MS - (Date.now() - start);
    const batch = Math.max(1, Math.min(BATCH_SIZE, Math.floor(remaining / SEND_DELAY_MS)));
    const { data: jobs, error } = await db.rpc('claim_email_jobs', { p_batch_size: batch, p_worker_id: workerId });
    if (error) { await logActivity('job', 'error', `claim_email_jobs failed: ${error.message}`); break; }
    if (!jobs || jobs.length === 0) { drained = true; break; }

    for (const job of jobs as Job[]) {
      if (Date.now() - start >= MAX_RUNTIME_MS) break;
      let campaign = campaignCache.get(job.campaign_id);
      if (!campaign) {
        const { data } = await db.from('campaigns')
          .select('id, template_name, from_name, from_email, flyer_image_url')
          .eq('id', job.campaign_id).single();
        if (!data) {
          await db.from('email_jobs').update({ status: 'cancelled', last_error: 'Campaign missing', locked_at: null, locked_by: null }).eq('id', job.id);
          continue;
        }
        campaign = data as Campaign;
        campaignCache.set(job.campaign_id, campaign);
      }
      await processJob(db, job, campaign);
      processed++;
      await sleep(SEND_DELAY_MS);
    }
  }

  // Safety net: never leave jobs this worker claimed stranded in `processing`.
  // If the time budget cut us off mid-batch, release the unsent remainder back
  // to the queue immediately so the next tick picks them up — instead of them
  // waiting ~10 min for the stuck-job sweep. These were claimed-but-never-sent,
  // so re-queueing is correct and cannot cause a duplicate send.
  await db.from('email_jobs')
    .update({ status: 'queued', locked_at: null, locked_by: null, next_attempt_at: new Date().toISOString() })
    .eq('locked_by', workerId)
    .eq('status', 'processing');

  await db.rpc('reconcile_campaigns');
  if (processed > 0) await logActivity('job', 'info', `Worker processed ${processed} job(s)`, { metadata: { processed, drained } });
  return { processed, drained };
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;
  // Header only — never accept the secret via query string, which would leak
  // the service-role key into Netlify/proxy access logs.
  const provided = req.headers.get('x-cron-secret');
  return provided === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return NextResponse.json({ success: false, error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const workerId = randomUUID();
  const { processed, drained } = await drain(workerId);

  // NOTE: no self-chaining. The previous self-re-trigger spawned many
  // overlapping invocations that collectively blew past Resend's 5 req/s
  // rate limit (causing mass "Too many requests" failures). Sending is now
  // driven solely by the once-a-minute pg_cron tick, so exactly one worker
  // runs at a time and stays well under the rate limit. Throughput is paced
  // by SEND_DELAY_MS; the queue drains over successive ticks.
  return NextResponse.json({ success: true, processed, drained });
}

export async function POST(req: NextRequest) {
  try { return await handle(req); }
  catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

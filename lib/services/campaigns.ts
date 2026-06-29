import { getAdminClient } from '@/lib/supabaseAdmin';
import { contactIdsForLists } from '@/lib/services/lists';
import type { Campaign, CampaignProgress, RecipientSelection } from '@/lib/types';

const COLS =
  'id, name, template_name, from_name, from_email, flyer_image_url, status, scheduled_at, total_recipients, created_by, created_at, updated_at, started_at, completed_at';

function ts(v: any): number | null {
  return v ? new Date(v).getTime() : null;
}

function mapCampaign(row: any): Campaign {
  return {
    id: row.id,
    name: row.name,
    templateName: row.template_name,
    fromName: row.from_name,
    fromEmail: row.from_email,
    flyerImageUrl: row.flyer_image_url ?? null,
    status: row.status,
    scheduledAt: ts(row.scheduled_at),
    totalRecipients: row.total_recipients ?? 0,
    createdAt: ts(row.created_at) ?? 0,
    updatedAt: ts(row.updated_at) ?? 0,
    startedAt: ts(row.started_at),
    completedAt: ts(row.completed_at),
  };
}

function mapProgress(row: any): CampaignProgress {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    templateName: row.template_name,
    fromName: row.from_name,
    fromEmail: row.from_email,
    scheduledAt: ts(row.scheduled_at),
    createdAt: ts(row.created_at) ?? 0,
    startedAt: ts(row.started_at),
    completedAt: ts(row.completed_at),
    totalRecipients: row.total_recipients ?? 0,
    jobCount: Number(row.job_count ?? 0),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
    skipped: Number(row.skipped ?? 0),
    pending: Number(row.pending ?? 0),
    completionPct: Number(row.completion_pct ?? 0),
  };
}

export async function listCampaigns(): Promise<CampaignProgress[]> {
  const { data, error } = await getAdminClient()
    .from('campaign_progress')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProgress);
}

/** The most recently created campaign's live progress, or null if none exist. */
export async function getLatestCampaignProgress(): Promise<CampaignProgress | null> {
  const { data, error } = await getAdminClient()
    .from('campaign_progress')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

/** The most recent campaign using a given template, or null if none exist. */
export async function getLatestCampaignProgressByTemplate(
  templateName: string
): Promise<CampaignProgress | null> {
  const { data, error } = await getAdminClient()
    .from('campaign_progress')
    .select('*')
    .eq('template_name', templateName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

/** The most recent campaign using any of the given templates, or null. */
export async function getLatestCampaignProgressByTemplates(
  templateNames: readonly string[]
): Promise<CampaignProgress | null> {
  if (templateNames.length === 0) return null;
  const { data, error } = await getAdminClient()
    .from('campaign_progress')
    .select('*')
    .in('template_name', templateNames as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

export async function getCampaignProgress(id: string): Promise<CampaignProgress | null> {
  const { data, error } = await getAdminClient()
    .from('campaign_progress').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapProgress(data);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await getAdminClient().from('campaigns').select(COLS).eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapCampaign(data);
}

export interface CreateCampaignInput {
  name: string;
  templateName?: string;
  fromName?: string;
  fromEmail?: string;
  flyerImageUrl?: string | null;
  scheduledAt?: number | null;
  createdBy?: string | null;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const { data, error } = await getAdminClient()
    .from('campaigns')
    .insert({
      name: input.name,
      template_name: input.templateName ?? 'praise-party',
      from_name: input.fromName ?? process.env.FROM_NAME ?? 'Praise Party 3.0',
      from_email: input.fromEmail ?? process.env.FROM_EMAIL ?? 'noreply@resend.dev',
      flyer_image_url: input.flyerImageUrl ?? null,
      scheduled_at: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
      status: 'draft',
      created_by: input.createdBy ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return mapCampaign(data);
}

export async function updateCampaignDraft(
  id: string,
  updates: Partial<CreateCampaignInput>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.templateName !== undefined) payload.template_name = updates.templateName;
  if (updates.fromName !== undefined) payload.from_name = updates.fromName;
  if (updates.fromEmail !== undefined) payload.from_email = updates.fromEmail;
  if (updates.flyerImageUrl !== undefined) payload.flyer_image_url = updates.flyerImageUrl;
  if (updates.scheduledAt !== undefined) {
    payload.scheduled_at = updates.scheduledAt ? new Date(updates.scheduledAt).toISOString() : null;
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await getAdminClient().from('campaigns').update(payload).eq('id', id);
  if (error) throw error;
}

/**
 * Resolve a recipient selection into email_jobs and move the campaign into
 * the active (or scheduled) queue. Uses set-based RPCs so "all contacts"
 * is a single fast statement.
 */
export async function enqueueCampaign(
  id: string,
  selection: RecipientSelection
): Promise<{ enqueued: number; status: string }> {
  const db = getAdminClient();
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error('Campaign not found');
  if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
    throw new Error(`Cannot enqueue a campaign in status "${campaign.status}"`);
  }

  let enqueued = 0;
  if (selection.allContacts) {
    const { data, error } = await db.rpc('enqueue_all', { p_campaign_id: id });
    if (error) throw error;
    enqueued += Number(data ?? 0);
  } else {
    const listIds = selection.listIds ?? [];
    if (listIds.length) {
      const { data, error } = await db.rpc('enqueue_lists', {
        p_campaign_id: id, p_list_ids: listIds,
      });
      if (error) throw error;
      enqueued += Number(data ?? 0);
    }
    const contactIds = selection.contactIds ?? [];
    if (contactIds.length) {
      const { data, error } = await db.rpc('enqueue_contacts', {
        p_campaign_id: id, p_contact_ids: contactIds,
      });
      if (error) throw error;
      enqueued += Number(data ?? 0);
    }
  }

  // Total recipients = all jobs ever created for this campaign.
  const { count } = await db
    .from('email_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', id);

  const future = campaign.scheduledAt && campaign.scheduledAt > Date.now();
  const status = future ? 'scheduled' : 'queued';
  const { error: upErr } = await db
    .from('campaigns')
    .update({
      status,
      total_recipients: count ?? 0,
      started_at: future ? null : new Date().toISOString(),
    })
    .eq('id', id);
  if (upErr) throw upErr;

  return { enqueued, status };
}

/** Pause: stop the worker from claiming this campaign's jobs. */
export async function pauseCampaign(id: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('campaigns').update({ status: 'paused' })
    .eq('id', id).in('status', ['queued', 'processing', 'scheduled']);
  if (error) throw error;
}

export async function resumeCampaign(id: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('campaigns').update({ status: 'queued', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'paused');
  if (error) throw error;
}

/** Cancel: stop sending and mark all unsent jobs cancelled. */
export async function cancelCampaign(id: string): Promise<void> {
  const db = getAdminClient();
  const { error: jErr } = await db
    .from('email_jobs')
    .update({ status: 'cancelled' })
    .eq('campaign_id', id)
    .in('status', ['queued', 'retrying', 'processing']);
  if (jErr) throw jErr;
  const { error } = await db
    .from('campaigns')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Duplicate a campaign's settings as a fresh draft (no jobs copied). */
export async function duplicateCampaign(id: string): Promise<Campaign> {
  const src = await getCampaign(id);
  if (!src) throw new Error('Campaign not found');
  return createCampaign({
    name: `${src.name} (copy)`,
    templateName: src.templateName,
    fromName: src.fromName,
    fromEmail: src.fromEmail,
    flyerImageUrl: src.flyerImageUrl,
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  // email_jobs cascade-delete via FK.
  const { error } = await getAdminClient().from('campaigns').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Kick the same-origin worker route for immediate pickup (best-effort). The
 * worker then self-chains until the queue drains, so sending continues even
 * after the admin's browser closes. Uses the existing service-role key as the
 * shared secret — no extra env required. pg_cron is the backstop.
 */
export async function triggerWorker(origin?: string): Promise<void> {
  const base = origin || process.env.WORKER_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) return;
  const url = base.includes('/api/cron')
    ? base
    : `${base.replace(/\/$/, '')}/api/cron/process-queue`;
  try {
    // Fire-and-forget: don't block the API response on the drain.
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: '{}',
    });
  } catch {
    /* worker will be picked up by cron regardless */
  }
}

import { getAdminClient } from '@/lib/supabaseAdmin';
import type { ActivityLog, Paginated } from '@/lib/types';

function mapLog(row: any): ActivityLog {
  return {
    id: row.id,
    type: row.type,
    level: row.level,
    message: row.message,
    metadata: row.metadata ?? null,
    campaignId: row.campaign_id ?? null,
    contactId: row.contact_id ?? null,
    actor: row.actor ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  };
}

export interface ListLogsParams {
  page?: number;
  pageSize?: number;
  type?: string;
  level?: string;
  campaignId?: string;
}

export async function listLogs(params: ListLogsParams): Promise<Paginated<ActivityLog>> {
  const db = getAdminClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db.from('activity_logs').select('*', { count: 'exact' });
  if (params.type) query = query.eq('type', params.type);
  if (params.level) query = query.eq('level', params.level);
  if (params.campaignId) query = query.eq('campaign_id', params.campaignId);
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  const total = count ?? 0;
  return {
    items: (data ?? []).map(mapLog),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Aggregate counts for the dashboard. */
export async function getDashboardStats(): Promise<{
  contacts: number;
  suppressed: number;
  lists: number;
  campaigns: number;
  activeCampaigns: number;
  sentTotal: number;
}> {
  const db = getAdminClient();
  const [contacts, suppressed, lists, campaigns, activeCampaigns, sent] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('suppressed', true),
    db.from('contact_lists').select('id', { count: 'exact', head: true }),
    db.from('campaigns').select('id', { count: 'exact', head: true }),
    db.from('campaigns').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing', 'scheduled', 'paused']),
    db.from('email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
  ]);
  return {
    contacts: contacts.count ?? 0,
    suppressed: suppressed.count ?? 0,
    lists: lists.count ?? 0,
    campaigns: campaigns.count ?? 0,
    activeCampaigns: activeCampaigns.count ?? 0,
    sentTotal: sent.count ?? 0,
  };
}

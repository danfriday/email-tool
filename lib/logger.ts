import { getAdminClient } from '@/lib/supabaseAdmin';

type Level = 'info' | 'warn' | 'error';

interface LogOptions {
  campaignId?: string | null;
  contactId?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Persist an activity-log entry. Logging must never throw into the caller,
 * so failures are swallowed (and echoed to the server console).
 */
export async function logActivity(
  type: string,
  level: Level,
  message: string,
  opts: LogOptions = {}
): Promise<void> {
  try {
    await getAdminClient().from('activity_logs').insert({
      type,
      level,
      message: message.slice(0, 2000),
      campaign_id: opts.campaignId ?? null,
      contact_id: opts.contactId ?? null,
      actor: opts.actor ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.error('logActivity failed:', err);
  }
}

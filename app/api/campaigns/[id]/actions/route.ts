import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import {
  enqueueCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  duplicateCampaign,
  triggerWorker,
} from '@/lib/services/campaigns';
import { logActivity } from '@/lib/logger';
import { asUuidArray, isUuid, ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

// POST { action: 'enqueue'|'pause'|'resume'|'cancel'|'duplicate', selection? }
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!isUuid(params.id)) throw new ValidationError('Invalid campaign id');
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? '');

    switch (action) {
      case 'enqueue': {
        const sel = body.selection ?? {};
        const selection = {
          allContacts: !!sel.allContacts,
          listIds: asUuidArray(sel.listIds),
          contactIds: asUuidArray(sel.contactIds),
        };
        if (!selection.allContacts && !selection.listIds.length && !selection.contactIds.length) {
          throw new ValidationError('Select recipients: contacts, lists, or all contacts');
        }
        const result = await enqueueCampaign(params.id, selection);
        await logActivity('campaign', 'info',
          `Campaign queued: ${result.enqueued} recipient(s)`,
          { campaignId: params.id, actor: user.email, metadata: result });
        // Best-effort instant pickup; pg_cron is the guaranteed path.
        await triggerWorker(request.nextUrl.origin);
        return NextResponse.json({ success: true, ...result });
      }
      case 'pause':
        await pauseCampaign(params.id);
        await logActivity('campaign', 'info', 'Campaign paused', { campaignId: params.id, actor: user.email });
        return NextResponse.json({ success: true });
      case 'resume':
        await resumeCampaign(params.id);
        await triggerWorker(request.nextUrl.origin);
        await logActivity('campaign', 'info', 'Campaign resumed', { campaignId: params.id, actor: user.email });
        return NextResponse.json({ success: true });
      case 'cancel':
        await cancelCampaign(params.id);
        await logActivity('campaign', 'warn', 'Campaign cancelled', { campaignId: params.id, actor: user.email });
        return NextResponse.json({ success: true });
      case 'duplicate': {
        const copy = await duplicateCampaign(params.id);
        await logActivity('campaign', 'info', `Campaign duplicated → ${copy.id}`, { campaignId: copy.id, actor: user.email });
        return NextResponse.json({ success: true, campaign: copy });
      }
      default:
        throw new ValidationError(`Unknown action "${action}"`);
    }
  } catch (err) {
    return errorResponse(err);
  }
}

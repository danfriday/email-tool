import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import {
  createCampaign,
  enqueueCampaign,
  getCampaignProgress,
  getLatestCampaignProgress,
  triggerWorker,
} from '@/lib/services/campaigns';
import { countActiveContacts } from '@/lib/services/contacts';
import { logActivity } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — what the Send tab needs to render: how many people will receive the
// email, plus the live progress of the most recent send (if any).
export async function GET() {
  try {
    await requireUser();
    const [activeContacts, current] = await Promise.all([
      countActiveContacts(),
      getLatestCampaignProgress(),
    ]);
    return NextResponse.json({ success: true, activeContacts, current });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — the Send button. Sends the Praise Party template to every active
// contact. Behind the scenes this creates one batch and hands it to the
// background worker, so sending is reliable and survives closing the page.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const recipients = await countActiveContacts();
    if (recipients === 0) {
      throw new ValidationError('No active contacts to send to. Import contacts first.');
    }

    const name = `Send ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
    const campaign = await createCampaign({ name, createdBy: user.id });

    const result = await enqueueCampaign(campaign.id, { allContacts: true });
    await logActivity('campaign', 'info', `Send started: ${result.enqueued} recipient(s)`, {
      campaignId: campaign.id, actor: user.email, metadata: result,
    });

    // Best-effort instant pickup; pg_cron is the guaranteed backstop.
    await triggerWorker(request.nextUrl.origin);

    const progress = await getCampaignProgress(campaign.id);
    return NextResponse.json({ success: true, enqueued: result.enqueued, current: progress });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import {
  createCampaign,
  enqueueCampaign,
  getCampaignProgress,
  getLatestCampaignProgressByTemplate,
  triggerWorker,
} from '@/lib/services/campaigns';
import { getOrCreateListByName, countActiveContactsInList } from '@/lib/services/lists';
import { logActivity } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';
import { REMINDER_LIST_NAME, REMINDER_TEMPLATE_NAME } from '@/lib/reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — what the Reminder tab needs: how many registrants are on the reminder
// list (and will be emailed), plus the live progress of the most recent
// reminder send.
export async function GET() {
  try {
    await requireUser();
    const list = await getOrCreateListByName(REMINDER_LIST_NAME);
    const [recipients, current] = await Promise.all([
      countActiveContactsInList(list.id),
      getLatestCampaignProgressByTemplate(REMINDER_TEMPLATE_NAME),
    ]);
    return NextResponse.json({ success: true, recipients, current });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — the Send Reminder button. Sends the reminder template to everyone on
// the reminder list only. Behind the scenes this is one campaign handed to the
// same background worker as the invite send, so it is reliable and survives
// closing the page.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const list = await getOrCreateListByName(REMINDER_LIST_NAME);
    const recipients = await countActiveContactsInList(list.id);
    if (recipients === 0) {
      throw new ValidationError('No one on the reminder list yet. Upload the registered list first.');
    }

    const name = `Reminder ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
    const campaign = await createCampaign({
      name,
      templateName: REMINDER_TEMPLATE_NAME,
      createdBy: user.id,
    });

    const result = await enqueueCampaign(campaign.id, { listIds: [list.id] });
    await logActivity('campaign', 'info', `Reminder send started: ${result.enqueued} recipient(s)`, {
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

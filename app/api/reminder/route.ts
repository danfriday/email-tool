import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import {
  createCampaign,
  enqueueCampaign,
  getCampaignProgress,
  getLatestCampaignProgressByTemplates,
  triggerWorker,
} from '@/lib/services/campaigns';
import { getOrCreateListByName, countActiveContactsInList } from '@/lib/services/lists';
import { logActivity } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';
import {
  REMINDER_LIST_NAME,
  REMINDER_TEMPLATE_NAME,
  REMINDER_LIST_TEMPLATES,
  REMINDER_TEMPLATE_LABELS,
  type ReminderListTemplate,
} from '@/lib/reminder';

// Pick a valid template for the registrants list from request input, defaulting
// to the reminder template if the value is missing or unrecognised.
function resolveTemplate(value: unknown): ReminderListTemplate {
  return (REMINDER_LIST_TEMPLATES as readonly string[]).includes(value as string)
    ? (value as ReminderListTemplate)
    : REMINDER_TEMPLATE_NAME;
}

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
      // Most recent send to this list, whichever template it used (reminder or
      // thank-you), so the UI shows live progress for either.
      getLatestCampaignProgressByTemplates(REMINDER_LIST_TEMPLATES),
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

    const body = await request.json().catch(() => ({}));
    const templateName = resolveTemplate((body as { templateName?: unknown })?.templateName);
    const label = REMINDER_TEMPLATE_LABELS[templateName];

    const list = await getOrCreateListByName(REMINDER_LIST_NAME);
    const recipients = await countActiveContactsInList(list.id);
    if (recipients === 0) {
      throw new ValidationError('No one on the reminder list yet. Upload the registered list first.');
    }

    const name = `${label} ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
    const campaign = await createCampaign({
      name,
      templateName,
      createdBy: user.id,
    });

    const result = await enqueueCampaign(campaign.id, { listIds: [list.id] });
    await logActivity('campaign', 'info', `${label} send started: ${result.enqueued} recipient(s)`, {
      campaignId: campaign.id, actor: user.email, metadata: { ...result, templateName },
    });

    // Best-effort instant pickup; pg_cron is the guaranteed backstop.
    await triggerWorker(request.nextUrl.origin);

    const progress = await getCampaignProgress(campaign.id);
    return NextResponse.json({ success: true, enqueued: result.enqueued, current: progress });
  } catch (err) {
    return errorResponse(err);
  }
}

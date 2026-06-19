import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { getCampaignProgress, updateCampaignDraft, deleteCampaign, getCampaign } from '@/lib/services/campaigns';
import { logActivity } from '@/lib/logger';
import { isValidEmail, normalizeEmail, sanitizeText, isUuid, ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await requireUser();
    if (!isUuid(params.id)) throw new ValidationError('Invalid campaign id');
    const progress = await getCampaignProgress(params.id);
    if (!progress) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, campaign: progress });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    await requireUser();
    if (!isUuid(params.id)) throw new ValidationError('Invalid campaign id');
    const campaign = await getCampaign(params.id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      throw new ValidationError(`Cannot edit a campaign in status "${campaign.status}"`);
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = sanitizeText(body.name, 120);
    if (body.fromName !== undefined) updates.fromName = sanitizeText(body.fromName, 80);
    if (body.fromEmail !== undefined) {
      if (!isValidEmail(body.fromEmail)) throw new ValidationError('Invalid from email');
      updates.fromEmail = normalizeEmail(body.fromEmail);
    }
    if (body.flyerImageUrl !== undefined) updates.flyerImageUrl = String(body.flyerImageUrl).slice(0, 500);
    if (body.scheduledAt !== undefined) {
      updates.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt).getTime() : null;
    }
    await updateCampaignDraft(params.id, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!isUuid(params.id)) throw new ValidationError('Invalid campaign id');
    await deleteCampaign(params.id);
    await logActivity('campaign', 'info', 'Campaign deleted', { campaignId: params.id, actor: user.email });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

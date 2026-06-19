import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { listCampaigns, createCampaign } from '@/lib/services/campaigns';
import { logActivity } from '@/lib/logger';
import { isValidEmail, normalizeEmail, sanitizeText, ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireUser();
    const campaigns = await listCampaigns();
    return NextResponse.json({ success: true, campaigns });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const name = sanitizeText(body.name ?? '', 120);
    if (!name) throw new ValidationError('Campaign name is required');

    let fromEmail: string | undefined;
    if (body.fromEmail) {
      if (!isValidEmail(body.fromEmail)) throw new ValidationError('Invalid from email');
      fromEmail = normalizeEmail(body.fromEmail);
    }
    let scheduledAt: number | null | undefined;
    if (body.scheduledAt) {
      const t = new Date(body.scheduledAt).getTime();
      if (!Number.isFinite(t)) throw new ValidationError('Invalid scheduledAt');
      scheduledAt = t;
    }

    const campaign = await createCampaign({
      name,
      templateName: body.templateName ? sanitizeText(body.templateName, 60) : undefined,
      fromName: body.fromName ? sanitizeText(body.fromName, 80) : undefined,
      fromEmail,
      flyerImageUrl: body.flyerImageUrl ? String(body.flyerImageUrl).slice(0, 500) : undefined,
      scheduledAt,
      createdBy: user.id,
    });
    await logActivity('campaign', 'info', `Campaign created: ${name}`, {
      campaignId: campaign.id, actor: user.email,
    });
    return NextResponse.json({ success: true, campaign });
  } catch (err) {
    return errorResponse(err);
  }
}

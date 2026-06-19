import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { getDashboardStats } from '@/lib/services/logs';
import { listCampaigns } from '@/lib/services/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireUser();
    const [stats, campaigns] = await Promise.all([getDashboardStats(), listCampaigns()]);
    return NextResponse.json({
      success: true,
      stats,
      activeCampaigns: campaigns.filter((c) =>
        ['queued', 'processing', 'scheduled', 'paused'].includes(c.status)
      ),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

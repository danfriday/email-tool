import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { listLogs } from '@/lib/services/logs';
import { clampInt, sanitizeText } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const result = await listLogs({
      page: clampInt(sp.get('page'), 1, 1_000_000, 1),
      pageSize: clampInt(sp.get('pageSize'), 1, 200, 50),
      type: sanitizeText(sp.get('type') ?? '', 30) || undefined,
      level: sanitizeText(sp.get('level') ?? '', 10) || undefined,
      campaignId: sp.get('campaignId') || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getPublicFileUrl } from '@/lib/supabase';

export async function GET(_req: NextRequest) {
  const publicUrl =
    process.env.NEXT_PUBLIC_FLYER_IMAGE_URL ||
    (process.env.SUPABASE_FLYER_FILE || process.env.NEXT_PUBLIC_SUPABASE_FLYER_FILE
      ? getPublicFileUrl(process.env.SUPABASE_FLYER_FILE || process.env.NEXT_PUBLIC_SUPABASE_FLYER_FILE!)
      : null);

  if (publicUrl) {
    return NextResponse.redirect(publicUrl, 307);
  }

  try {
    const filePath = join(process.cwd(), 'IMG-20260428-WA0160.jpg');
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Flyer not found' }, { status: 404 });
  }
}

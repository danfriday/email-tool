import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { uploadFileToBucket, getPublicFileUrl } from '@/lib/supabase';

export async function POST() {
  try {
    const fileName =
      process.env.SUPABASE_FLYER_FILE ||
      process.env.NEXT_PUBLIC_SUPABASE_FLYER_FILE ||
      'IMG-20260428-WA0160.jpg';

    const filePath = join(process.cwd(), fileName);
    const fileBuffer = await fs.readFile(filePath);

    await uploadFileToBucket(fileName, fileBuffer, 'image/jpeg');

    return NextResponse.json({
      success: true,
      publicUrl: getPublicFileUrl(fileName),
      message: 'Flyer uploaded to Supabase storage',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

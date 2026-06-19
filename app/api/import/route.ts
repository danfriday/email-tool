import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireUser, errorResponse } from '@/lib/auth';
import { bulkInsertContacts } from '@/lib/services/contacts';
import { addContactsToList } from '@/lib/services/lists';
import { extractContactsFromWorkbook } from '@/lib/sheetParser';
import { logActivity } from '@/lib/logger';
import { isValidEmail, normalizeEmail, isUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const listId = formData.get('listId');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File is too large (max 10 MB)' },
        { status: 413 }
      );
    }

    const buffer = await file.arrayBuffer();
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Could not read file. Upload a valid .xlsx, .xls or .csv.' },
        { status: 400 }
      );
    }

    const { contacts: rowCandidates, totalRows } = extractContactsFromWorkbook(workbook);

    // Validate + de-dupe within the file before touching the DB.
    const seen = new Set<string>();
    const clean: Array<{ name: string; email: string }> = [];
    let invalid = 0;
    let inlineDuplicates = 0;
    for (const c of rowCandidates) {
      const email = normalizeEmail(c.email);
      if (!isValidEmail(email)) { invalid++; continue; }
      if (seen.has(email)) { inlineDuplicates++; continue; }
      seen.add(email);
      clean.push({ name: (c.name ?? '').slice(0, 120), email });
    }

    // The DB unique index handles existing-email dedup atomically.
    const { inserted, insertedCount } = await bulkInsertContacts(clean);
    const existingDuplicates = clean.length - insertedCount;

    // Optionally add the newly imported (and pre-existing) contacts to a list.
    if (isUuid(listId)) {
      const ids = inserted.map((c) => c.id);
      if (ids.length) await addContactsToList(listId as string, ids);
    }

    await logActivity(
      'import',
      'info',
      `Imported "${file.name}": ${insertedCount} added, ${existingDuplicates} existing, ${inlineDuplicates} dup rows, ${invalid} invalid`,
      { actor: user.email, metadata: { totalRows, insertedCount, existingDuplicates, inlineDuplicates, invalid } }
    );

    return NextResponse.json({
      success: true,
      result: {
        file: file.name,
        totalRows,
        found: clean.length,
        added: insertedCount,
        duplicates: existingDuplicates + inlineDuplicates,
        existingDuplicates,
        inlineDuplicates,
        invalid,
        contacts: inserted,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

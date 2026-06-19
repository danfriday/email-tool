import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireUser, errorResponse } from '@/lib/auth';
import { bulkInsertContacts, getContactsByEmails } from '@/lib/services/contacts';
import { addContactsToList, getOrCreateListByName } from '@/lib/services/lists';
import { extractContactsFromWorkbook } from '@/lib/sheetParser';
import { logActivity } from '@/lib/logger';
import { isValidEmail, normalizeEmail } from '@/lib/validation';
import { REMINDER_LIST_NAME } from '@/lib/reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Upload the list of people who have ALREADY registered. Their emails are added
// to the dedicated reminder list (new contacts created, existing ones reused) so
// the reminder send targets exactly this audience — not the whole contact pool.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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

    // Create any new contacts; existing emails are left untouched.
    const { insertedCount } = await bulkInsertContacts(clean);
    const existingDuplicates = clean.length - insertedCount;

    // Tag the WHOLE uploaded audience into the reminder list — both the newly
    // created contacts and the ones that already existed (registrants are very
    // likely already in the contact pool from the original invite). Resolving by
    // email is what makes the reminder reach existing contacts too.
    const list = await getOrCreateListByName(REMINDER_LIST_NAME);
    const uploadedEmails = clean.map((c) => c.email);
    const contacts = await getContactsByEmails(uploadedEmails);
    const added = await addContactsToList(list.id, contacts.map((c) => c.id));

    await logActivity(
      'import',
      'info',
      `Reminder list import "${file.name}": ${contacts.length} on list (${insertedCount} new, ${existingDuplicates} existing), ${inlineDuplicates} dup rows, ${invalid} invalid`,
      { actor: user.email, metadata: { totalRows, insertedCount, existingDuplicates, inlineDuplicates, invalid, added, listId: list.id } }
    );

    return NextResponse.json({
      success: true,
      result: {
        file: file.name,
        totalRows,
        found: clean.length,
        added,                          // contacts newly tagged onto the reminder list this upload
        onList: contacts.length,        // total uploaded emails resolved to contacts
        newContacts: insertedCount,
        existingContacts: existingDuplicates,
        duplicates: existingDuplicates + inlineDuplicates,
        inlineDuplicates,
        invalid,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { addContacts, getContactsByEmails } from '@/lib/supabase';
import { extractContactsFromWorkbook } from '@/lib/sheetParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
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
        { success: false, error: 'Could not read file. Please upload a valid .xlsx, .xls or .csv.' },
        { status: 400 }
      );
    }

    const { contacts: rowCandidates, totalRows } = extractContactsFromWorkbook(workbook);

    if (!rowCandidates.length) {
      return NextResponse.json({
        success: true,
        result: {
          file: file.name,
          totalRows,
          found: 0,
          added: 0,
          duplicates: 0,
          existingDuplicates: 0,
          inlineDuplicates: 0,
          errors: 0,
          contacts: [],
        },
      });
    }

    const allEmails = Array.from(new Set(rowCandidates.map((r) => r.email)));
    const existingContacts = await getContactsByEmails(allEmails);
    const existingEmails = new Set(existingContacts.map((c) => c.email.toLowerCase()));

    const newContactsMap = new Map<string, { name: string; email: string }>();
    let existingDuplicates = 0;
    let inlineDuplicates = 0;

    for (const candidate of rowCandidates) {
      if (existingEmails.has(candidate.email)) {
        existingDuplicates += 1;
        continue;
      }
      if (newContactsMap.has(candidate.email)) {
        inlineDuplicates += 1;
        continue;
      }
      newContactsMap.set(candidate.email, candidate);
    }

    const newContacts = Array.from(newContactsMap.values());
    let added: Array<{ id: string; name: string; email: string }> = [];
    let errors = 0;

    if (newContacts.length) {
      try {
        const addedIds = await addContacts(
          newContacts.map((contact) => ({ ...contact, status: 'pending' as const }))
        );
        added = newContacts.map((contact, index) => ({ id: addedIds[index], ...contact }));
      } catch (err) {
        console.error('Failed to insert contacts in bulk:', err);
        errors = newContacts.length;
      }
    }

    const duplicateEmails = existingDuplicates + inlineDuplicates;

    return NextResponse.json({
      success: true,
      result: {
        file: file.name,
        totalRows,
        found: added.length + duplicateEmails,
        added: added.length,
        duplicates: duplicateEmails,
        existingDuplicates,
        inlineDuplicates,
        errors,
        contacts: added,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { addContacts, getContactsByEmails } from '@/lib/supabase';
import { EMAIL_REGEX, normalizeEmail, parseName } from '@/lib/utils';

interface ImportResult {
  file: string;
  totalRows: number;
  found: number;
  added: number;
  duplicates: number;
  errors: number;
  contacts: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    const rowCandidates: Array<{ name: string; email: string }> = [];
    const totalRowsCounter = { totalRows: 0 };

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
      }) as Array<Record<string, unknown>>;

      if (!rows.length) continue;
      totalRowsCounter.totalRows += rows.length;
      const cols = Object.keys(rows[0]);

      const emailCol =
        cols.find((c) => /^e?mail$/i.test(c)) ||
        cols.find((c) => /email|e-mail/i.test(c)) ||
        cols.find((c) =>
          rows.slice(0, 20).some((r) => EMAIL_REGEX.test(String(r[c])))
        );

      if (!emailCol) continue;

      const firstCol = cols.find((c) => /first.?name|firstname/i.test(c));
      const lastCol = cols.find((c) => /last.?name|lastname/i.test(c));
      const nameCol =
        cols.find((c) => /^(full.?name|name|contact.?name)$/i.test(c)) ||
        (!firstCol && !lastCol
          ? cols.find(
              (c) =>
                !/email|mail|id|phone|tel/i.test(c) &&
                typeof rows[0][c] === 'string' &&
                rows[0][c].length > 1 &&
                rows[0][c].length < 80
            )
          : null);

      for (const row of rows) {
        const emailValue = String(row[emailCol]).trim();
        const email = normalizeEmail(emailValue);
        if (!EMAIL_REGEX.test(email)) continue;

        let name = '';
        if (firstCol || lastCol) {
          name = [firstCol ? row[firstCol] : '', lastCol ? row[lastCol] : '']
            .join(' ')
            .trim();
        } else if (nameCol) {
          name = String(row[nameCol]).trim();
        }

        if (!name) name = parseName(email.split('@')[0]);

        rowCandidates.push({ name, email });
      }
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
          newContacts.map((contact) => ({
            ...contact,
            status: 'pending',
          }))
        );

        added = newContacts.map((contact, index) => ({
          id: addedIds[index],
          ...contact,
        }));
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
        totalRows: totalRowsCounter.totalRows,
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
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

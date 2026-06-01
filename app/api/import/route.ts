import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { addContact, getContacts } from '@/lib/supabase';
import { EMAIL_REGEX, parseName } from '@/lib/utils';

interface ImportResult {
  file: string;
  totalRows: number;
  found: number;
  added: number;
  duplicates: number;
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

    // Get existing contacts to check for duplicates
    const existingContacts = await getContacts();
    const existingEmails = new Set(
      existingContacts.map((c) => c.email.toLowerCase())
    );

    const added = [];
    const duplicateEmails = new Set<string>();
    let totalRows = 0;

    // Process all sheets
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
      }) as Array<Record<string, unknown>>;

      if (!rows.length) continue;

      totalRows += rows.length;
      const cols = Object.keys(rows[0]);

      // Auto-detect email column
      const emailCol =
        cols.find((c) => /^e?mail$/i.test(c)) ||
        cols.find((c) => /email|e-mail/i.test(c)) ||
        cols.find((c) =>
          rows.slice(0, 20).some((r) => EMAIL_REGEX.test(String(r[c])))
        );

      if (!emailCol) continue;

      // Auto-detect name columns
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

      // Process rows
      for (const row of rows) {
        const email = String(row[emailCol]).trim().toLowerCase();

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

        // Check for duplicates
        if (existingEmails.has(email)) {
          duplicateEmails.add(email);
          continue;
        }

        // Add to Firebase
        try {
          const id = await addContact({
            name,
            email,
            status: 'pending',
          });

          added.push({ id, name, email });
          existingEmails.add(email);
        } catch (err) {
          console.error(`Failed to add contact ${email}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        file: file.name,
        totalRows,
        found: added.length + duplicateEmails.size,
        added: added.length,
        duplicates: duplicateEmails.size,
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

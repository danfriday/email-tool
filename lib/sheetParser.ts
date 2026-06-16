import * as XLSX from 'xlsx';
import { parseName } from '@/lib/utils';

/**
 * Robust contact extraction from arbitrary Excel/CSV workbooks.
 *
 * Handles the messy real-world sheets people actually submit:
 *  - header row that is not the first row (banners/blank rows above it)
 *  - sheets with no header row at all (detect columns by content)
 *  - email cells containing extra text, `mailto:` prefixes or multiple emails
 *  - split name columns (First/Last, Surname/Other Names, Title) and full-name columns
 *  - ALL CAPS / all lowercase names, stray quotes and non-breaking spaces
 */

// Finds e-mail-looking substrings inside a noisy cell value.
const EMAIL_FIND_REGEX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
// Strict-ish validator for a already-extracted token.
export const EMAIL_VALIDATE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HOW_MANY_ROWS_TO_SAMPLE = 60;
const HOW_MANY_ROWS_TO_FIND_HEADER = 15;

export interface ParsedContact {
  name: string;
  email: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  totalRows: number;
}

function normHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^﻿/, '') // strip BOM
    .replace(/[\s ]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Pull the first valid email out of an arbitrary cell value. */
export function extractEmail(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const cleaned = raw.replace(/^mailto:/i, '');
  const matches = cleaned.match(EMAIL_FIND_REGEX);
  if (!matches || !matches.length) return null;

  const email = matches[0]
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, ''); // trailing punctuation

  return EMAIL_VALIDATE_REGEX.test(email) ? email : null;
}

const TITLE_PREFIX_REGEX =
  /^(mr|mrs|ms|miss|dr|prof|professor|pastor|pst|rev|reverend|engr|evang|evangelist|deacon|deaconess|bro|sis|sister|brother|chief|sir|hon|barr|elder|minister|apostle|bishop)\.?\s+/i;

/** Normalise a human name: collapse spaces, drop stray quotes, fix casing. */
export function cleanName(raw: unknown): string {
  let s = String(raw ?? '')
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

  if (!s) return '';

  // Fix shouty ALL CAPS or flat lowercase to Title Case; leave mixed case alone.
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  if (!hasLower || !hasUpper) {
    s = s
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      // O'brien -> O'Brien, mcdonald handled lightly
      .replace(/([A-Za-z])'([a-z])/g, (_m, a, b) => `${a}'${String(b).toUpperCase()}`);
  }

  return s.trim();
}

/** Does this string look like a person's name rather than an id/number/email? */
function looksLikeName(value: unknown): boolean {
  const s = String(value ?? '').trim();
  if (s.length < 2 || s.length > 80) return false;
  if (extractEmail(s)) return false;
  const letters = (s.match(/[A-Za-zÀ-ɏ]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  if (letters < 2) return false;
  if (digits > letters) return false; // mostly numeric -> phone/id
  return true;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const cells = row.map(normHeader).filter(Boolean);
  if (!cells.length) return false;
  // A header cell should never itself be an email address / value.
  if (cells.some((c) => EMAIL_VALIDATE_REGEX.test(c))) return false;
  const hasEmail = cells.some((c) => /e-?mail/.test(c));
  const hasName = cells.some((c) => /name|surname|first|last|full|contact/.test(c));
  return hasEmail || hasName;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  const limit = Math.min(rows.length, HOW_MANY_ROWS_TO_FIND_HEADER);
  for (let i = 0; i < limit; i += 1) {
    if (looksLikeHeaderRow(rows[i])) return i;
  }
  return -1;
}

function columnCount(rows: unknown[][]): number {
  return rows.reduce((max, r) => Math.max(max, r.length), 0);
}

/** Pick the column index whose sampled cells most often parse as emails. */
function detectEmailColumnByContent(dataRows: unknown[][], cols: number): number {
  let bestCol = -1;
  let bestHits = 0;
  const sample = dataRows.slice(0, HOW_MANY_ROWS_TO_SAMPLE);
  for (let c = 0; c < cols; c += 1) {
    let hits = 0;
    for (const row of sample) {
      if (extractEmail(row[c])) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestCol = c;
    }
  }
  return bestHits > 0 ? bestCol : -1;
}

/** Pick the best name column by content, excluding the email column. */
function detectNameColumnByContent(
  dataRows: unknown[][],
  cols: number,
  emailCol: number,
  headers: string[]
): number {
  let bestCol = -1;
  let bestScore = -1;
  const sample = dataRows.slice(0, HOW_MANY_ROWS_TO_SAMPLE);

  for (let c = 0; c < cols; c += 1) {
    if (c === emailCol) continue;
    const header = headers[c] || '';
    // Skip obvious non-name columns by header hint.
    if (/email|mail|phone|tel|mobile|number|^id$|date|time|amount|qty|status|gender|age|address/.test(header)) {
      continue;
    }
    let hits = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const v = row[c];
      if (String(v ?? '').trim() === '') continue;
      nonEmpty += 1;
      if (looksLikeName(v)) hits += 1;
    }
    if (nonEmpty === 0) continue;
    // Prefer columns that are both highly name-like and well-populated.
    const score = hits + hits / nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

function findHeaderIndex(headers: string[], test: RegExp): number {
  return headers.findIndex((h) => test.test(h));
}

export function extractContactsFromSheet(sheet: XLSX.WorkSheet): ParseResult {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (!rows.length) return { contacts: [], totalRows: 0 };

  const headerIndex = findHeaderRowIndex(rows);
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const cols = columnCount(rows);

  const headers: string[] =
    headerIndex >= 0
      ? Array.from({ length: cols }, (_, i) => normHeader(rows[headerIndex][i]))
      : Array.from({ length: cols }, () => '');

  // --- Email column ---
  let emailCol =
    findHeaderIndex(headers, /^e-?mail( ?address)?$/) >= 0
      ? findHeaderIndex(headers, /^e-?mail( ?address)?$/)
      : findHeaderIndex(headers, /e-?mail/);
  if (emailCol < 0) emailCol = detectEmailColumnByContent(dataRows, cols);

  if (emailCol < 0) {
    // No email anywhere in this sheet — nothing usable.
    return { contacts: [], totalRows: dataRows.filter((r) => r.some((c) => String(c ?? '').trim())).length };
  }

  // --- Name columns ---
  const titleCol = findHeaderIndex(headers, /^title$|salutation/);
  const firstCol = findHeaderIndex(headers, /first.?name|firstname|fname|given.?name/);
  const middleCol = findHeaderIndex(headers, /middle.?name/);
  const otherCol = findHeaderIndex(headers, /other.?names?/);
  const lastCol = findHeaderIndex(headers, /last.?name|lastname|lname/);
  const surnameCol = findHeaderIndex(headers, /surname|family.?name/);
  const fullCol = findHeaderIndex(headers, /^(full.?name|name|contact.?name|fullname)$/);

  const givenCol = firstCol >= 0 ? firstCol : otherCol;
  const familyCol = lastCol >= 0 ? lastCol : surnameCol;
  const hasSplitName = givenCol >= 0 || familyCol >= 0 || middleCol >= 0;

  // Ordered, de-duplicated list of columns that make up a split name.
  const splitCols = Array.from(
    new Set([titleCol, givenCol, middleCol, familyCol].filter((i) => i >= 0))
  );

  let contentNameCol = -1;
  if (!hasSplitName && fullCol < 0) {
    contentNameCol = detectNameColumnByContent(dataRows, cols, emailCol, headers);
  }

  const contacts: ParsedContact[] = [];
  let totalRows = 0;

  for (const row of dataRows) {
    if (!row.some((c) => String(c ?? '').trim())) continue; // skip blank lines
    totalRows += 1;

    const email = extractEmail(row[emailCol]);
    if (!email) continue;

    let name = '';
    if (hasSplitName) {
      name = cleanName(splitCols.map((i) => String(row[i] ?? '').trim()).filter(Boolean).join(' '));
    } else if (fullCol >= 0) {
      name = cleanName(row[fullCol]);
    } else if (contentNameCol >= 0) {
      name = cleanName(row[contentNameCol]);
    }

    if (!name) name = parseName(email.split('@')[0]);

    contacts.push({ name, email });
  }

  return { contacts, totalRows };
}

export function extractContactsFromWorkbook(workbook: XLSX.WorkBook): ParseResult {
  const all: ParsedContact[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const result = extractContactsFromSheet(workbook.Sheets[sheetName]);
    all.push(...result.contacts);
    totalRows += result.totalRows;
  }

  return { contacts: all, totalRows };
}

import { getAdminClient } from '@/lib/supabaseAdmin';
import { normalizeEmail } from '@/lib/validation';
import type { Contact, Paginated } from '@/lib/types';

const COLS = 'id, name, email, suppressed, suppressed_reason, created_at, updated_at';
const IN_CHUNK = 200;

function mapContact(row: any): Contact {
  return {
    id: row.id,
    name: row.name ?? '',
    email: row.email,
    suppressed: !!row.suppressed,
    suppressedReason: row.suppressed_reason ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ListContactsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: 'all' | 'active' | 'suppressed';
  sort?: 'created_at' | 'name' | 'email';
  order?: 'asc' | 'desc';
  listId?: string;
}

export async function listContacts(params: ListContactsParams): Promise<Paginated<Contact>> {
  const db = getAdminClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sort = params.sort ?? 'created_at';
  const ascending = (params.order ?? 'desc') === 'asc';

  // When filtering by list, resolve member ids first (indexed join table).
  let restrictIds: string[] | null = null;
  if (params.listId) {
    const { data, error } = await db
      .from('contact_list_members')
      .select('contact_id')
      .eq('list_id', params.listId);
    if (error) throw error;
    restrictIds = (data ?? []).map((r: any) => r.contact_id);
    if (restrictIds.length === 0) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  let query = db.from('contacts').select(COLS, { count: 'exact' });

  if (params.filter === 'active') query = query.eq('suppressed', false);
  if (params.filter === 'suppressed') query = query.eq('suppressed', true);

  if (params.search) {
    const term = params.search.replace(/[%,]/g, ' ').trim();
    if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  if (restrictIds) query = query.in('id', restrictIds);

  query = query.order(sort, { ascending }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  return {
    items: (data ?? []).map(mapContact),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { data, error } = await getAdminClient().from('contacts').select(COLS).eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapContact(data);
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const { data, error } = await getAdminClient()
    .from('contacts').select(COLS).eq('email', normalizeEmail(email)).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapContact(data);
}

export async function getContactsByEmails(emails: string[]): Promise<Contact[]> {
  if (!emails.length) return [];
  const db = getAdminClient();
  const normalized = Array.from(new Set(emails.map(normalizeEmail)));
  const results: Contact[] = [];
  for (const batch of chunk(normalized, IN_CHUNK)) {
    const { data, error } = await db.from('contacts').select(COLS).in('email', batch);
    if (error) throw error;
    results.push(...(data ?? []).map(mapContact));
  }
  return results;
}

export async function addContact(input: { name?: string; email: string }): Promise<Contact> {
  const { data, error } = await getAdminClient()
    .from('contacts')
    .insert({ name: input.name ?? '', email: normalizeEmail(input.email) })
    .select(COLS)
    .single();
  if (error) throw error;
  return mapContact(data);
}

/**
 * Bulk insert for imports. Uses upsert with ignoreDuplicates so existing
 * emails are skipped server-side (the DB unique index is the source of
 * truth, eliminating import race conditions). Returns inserted rows.
 */
export async function bulkInsertContacts(
  contacts: Array<{ name: string; email: string }>
): Promise<{ inserted: Contact[]; insertedCount: number }> {
  if (!contacts.length) return { inserted: [], insertedCount: 0 };
  const db = getAdminClient();
  const inserted: Contact[] = [];

  for (const batch of chunk(contacts, 500)) {
    const payload = batch.map((c) => ({ name: c.name ?? '', email: normalizeEmail(c.email) }));
    const { data, error } = await db
      .from('contacts')
      .upsert(payload, { onConflict: 'email', ignoreDuplicates: true })
      .select(COLS);
    if (error) throw error;
    inserted.push(...(data ?? []).map(mapContact));
  }
  return { inserted, insertedCount: inserted.length };
}

export async function updateContact(
  id: string,
  updates: { name?: string; email?: string; suppressed?: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = normalizeEmail(updates.email);
  if (updates.suppressed !== undefined) {
    payload.suppressed = updates.suppressed;
    if (!updates.suppressed) payload.suppressed_reason = null;
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await getAdminClient().from('contacts').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteContacts(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = getAdminClient();
  let deleted = 0;
  for (const batch of chunk(ids, IN_CHUNK)) {
    const { data, error } = await db.from('contacts').delete().in('id', batch).select('id');
    if (error) throw error;
    deleted += (data ?? []).length;
  }
  return deleted;
}

export async function deleteAllContacts(): Promise<void> {
  const { error } = await getAdminClient()
    .from('contacts').delete().not('id', 'is', null);
  if (error) throw error;
}

export async function suppressByEmail(emails: string[], reason: string): Promise<number> {
  if (!emails.length) return 0;
  const normalized = Array.from(new Set(emails.map(normalizeEmail)));
  const { data, error } = await getAdminClient()
    .from('contacts')
    .update({ suppressed: true, suppressed_reason: reason.slice(0, 500) })
    .in('email', normalized)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function countContacts(): Promise<number> {
  const { count, error } = await getAdminClient()
    .from('contacts').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Count contacts that are eligible to receive email (not suppressed). */
export async function countActiveContacts(): Promise<number> {
  const { count, error } = await getAdminClient()
    .from('contacts').select('id', { count: 'exact', head: true }).eq('suppressed', false);
  if (error) throw error;
  return count ?? 0;
}

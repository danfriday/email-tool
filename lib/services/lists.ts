import { getAdminClient } from '@/lib/supabaseAdmin';
import type { ContactList } from '@/lib/types';

const IN_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function mapList(row: any, count?: number): ContactList {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    contactCount: count,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}

/** All lists, each with its member count, optionally filtered by name. */
export async function listLists(search?: string): Promise<ContactList[]> {
  const db = getAdminClient();
  let query = db.from('contact_lists').select('*').order('name', { ascending: true });
  if (search) {
    const term = search.replace(/[%,]/g, ' ').trim();
    if (term) query = query.ilike('name', `%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const lists = data ?? [];
  // One grouped count query for all lists.
  const counts = new Map<string, number>();
  if (lists.length) {
    const { data: members, error: mErr } = await db
      .from('contact_list_members')
      .select('list_id')
      .in('list_id', lists.map((l: any) => l.id));
    if (mErr) throw mErr;
    for (const m of members ?? []) {
      counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1);
    }
  }
  return lists.map((l: any) => mapList(l, counts.get(l.id) ?? 0));
}

export async function createList(name: string, description?: string): Promise<ContactList> {
  const { data, error } = await getAdminClient()
    .from('contact_lists')
    .insert({ name, description: description ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return mapList(data, 0);
}

/**
 * Find a list by its exact name, creating it if it doesn't exist yet. Used for
 * stable, app-managed lists (e.g. the reminder audience) that have no UI to be
 * created by hand. Tolerates the unique-name race by re-reading on conflict.
 */
export async function getOrCreateListByName(name: string, description?: string): Promise<ContactList> {
  const db = getAdminClient();
  const { data: existing, error } = await db
    .from('contact_lists').select('*').eq('name', name).maybeSingle();
  if (error) throw error;
  if (existing) return mapList(existing);

  const { data, error: insErr } = await db
    .from('contact_lists')
    .insert({ name, description: description ?? null })
    .select('*')
    .single();
  if (insErr) {
    if ((insErr as any).code === '23505') {
      // Lost the race — another request created it. Read it back.
      const { data: row, error: reErr } = await db
        .from('contact_lists').select('*').eq('name', name).single();
      if (reErr) throw reErr;
      return mapList(row);
    }
    throw insErr;
  }
  return mapList(data, 0);
}

export async function renameList(id: string, name: string, description?: string): Promise<void> {
  const payload: Record<string, unknown> = { name };
  if (description !== undefined) payload.description = description;
  const { error } = await getAdminClient().from('contact_lists').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteList(id: string): Promise<void> {
  // members cascade-delete via FK.
  const { error } = await getAdminClient().from('contact_lists').delete().eq('id', id);
  if (error) throw error;
}

export async function addContactsToList(listId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  const db = getAdminClient();
  let added = 0;
  for (const batch of chunk(contactIds, 500)) {
    const rows = batch.map((cid) => ({ list_id: listId, contact_id: cid }));
    const { data, error } = await db
      .from('contact_list_members')
      .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
      .select('contact_id');
    if (error) throw error;
    added += (data ?? []).length;
  }
  return added;
}

export async function removeContactsFromList(listId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  const db = getAdminClient();
  let removed = 0;
  for (const batch of chunk(contactIds, IN_CHUNK)) {
    const { data, error } = await db
      .from('contact_list_members')
      .delete()
      .eq('list_id', listId)
      .in('contact_id', batch)
      .select('contact_id');
    if (error) throw error;
    removed += (data ?? []).length;
  }
  return removed;
}

/** Count of non-suppressed contacts on a list — i.e. how many will actually be emailed. */
export async function countActiveContactsInList(listId: string): Promise<number> {
  const db = getAdminClient();
  const { count, error } = await db
    .from('contact_list_members')
    .select('contacts!inner(suppressed)', { count: 'exact', head: true })
    .eq('list_id', listId)
    .eq('contacts.suppressed', false);
  if (error) throw error;
  return count ?? 0;
}

/** Distinct contact ids that belong to ANY of the given lists. */
export async function contactIdsForLists(listIds: string[]): Promise<string[]> {
  if (!listIds.length) return [];
  const db = getAdminClient();
  const ids = new Set<string>();
  for (const batch of chunk(listIds, IN_CHUNK)) {
    const { data, error } = await db
      .from('contact_list_members')
      .select('contact_id')
      .in('list_id', batch);
    if (error) throw error;
    for (const r of data ?? []) ids.add(r.contact_id);
  }
  return Array.from(ids);
}

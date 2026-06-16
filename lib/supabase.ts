import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Contact } from '@/lib/firebase';
import { normalizeEmail } from '@/lib/utils';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
      );
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

const supabaseBucket = process.env.SUPABASE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'flier';

export function getPublicFileUrl(fileName: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!baseUrl) {
    throw new Error('Missing Supabase public URL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  }

  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${supabaseBucket}/${encodeURIComponent(fileName)}`;
}

export async function uploadFileToBucket(fileName: string, fileData: Buffer, contentType = 'image/jpeg') {
  const { data, error } = await getSupabaseClient().storage
    .from(supabaseBucket)
    .upload(fileName, fileData, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error('Supabase uploadFileToBucket error:', error);
    throw error;
  }

  return data;
}

function mapContact(row: any): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status as Contact['status'],
    sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  };
}

export async function addContact(contact: Omit<Contact, 'id' | 'createdAt'>): Promise<string> {
  const normalizedEmail = normalizeEmail(contact.email);
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .insert([
      {
        name: contact.name,
        email: normalizedEmail,
        status: contact.status ?? 'pending',
        sent_at: contact.sentAt ? new Date(contact.sentAt).toISOString() : null,
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.error('Supabase addContact error:', error);
    throw error;
  }

  return data.id;
}

const DEFAULT_CONTACT_FETCH_LIMIT = 10000;

export async function getContacts(limit = DEFAULT_CONTACT_FETCH_LIMIT): Promise<Contact[]> {
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .select('id, name, email, status, sent_at, created_at')
    .order('created_at', { ascending: false })
    .range(0, limit - 1);

  if (error) {
    console.error('Supabase getContacts error:', error);
    throw error;
  }

  return (data ?? []).map(mapContact);
}

const IN_QUERY_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function getContactsByEmails(emails: string[]): Promise<Contact[]> {
  if (!emails.length) {
    return [];
  }

  const normalizedEmails = Array.from(new Set(emails.map((email) => normalizeEmail(email))));
  const results: Contact[] = [];

  for (const batch of chunk(normalizedEmails, IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await getSupabaseClient()
      .from('contacts')
      .select('id, name, email, status, sent_at, created_at')
      .in('email', batch);

    if (error) {
      console.error('Supabase getContactsByEmails error:', error);
      throw error;
    }

    results.push(...(data ?? []).map(mapContact));
  }

  return results;
}

export async function getContactsByIds(ids: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  if (!ids.length) return map;

  for (const batch of chunk(Array.from(new Set(ids)), IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await getSupabaseClient()
      .from('contacts')
      .select('id, name, email, status, sent_at, created_at')
      .in('id', batch);

    if (error) {
      console.error('Supabase getContactsByIds error:', error);
      throw error;
    }

    for (const row of data ?? []) {
      const contact = mapContact(row);
      if (contact.id) map.set(contact.id, contact);
    }
  }

  return map;
}

export async function markContactsBouncedByEmail(emails: string[]): Promise<number> {
  if (!emails.length) return 0;
  const normalized = Array.from(new Set(emails.map((email) => normalizeEmail(email))));

  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .update({ status: 'bounced' })
    .in('email', normalized)
    .select('id');

  if (error) {
    console.error('Supabase markContactsBouncedByEmail error:', error);
    throw error;
  }

  return (data ?? []).length;
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .select('id, name, email, status, sent_at, created_at')
    .eq('email', normalizedEmail)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Supabase getContactByEmail error:', error);
    throw error;
  }

  return mapContact(data);
}

export async function addContacts(
  contacts: Array<{
    name: string;
    email: string;
    status?: 'pending' | 'sent' | 'failed';
    sentAt?: number;
  }>
): Promise<string[]> {
  if (!contacts.length) {
    return [];
  }

  const insertPayload = contacts.map((contact) => ({
    name: contact.name,
    email: normalizeEmail(contact.email),
    status: contact.status ?? 'pending',
    sent_at: contact.sentAt ? new Date(contact.sentAt).toISOString() : null,
  }));

  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .insert(insertPayload)
    .select('id');

  if (error) {
    console.error('Supabase addContacts error:', error);
    throw error;
  }

  return (data ?? []).map((row: any) => row.id);
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .select('id, name, email, status, sent_at, created_at')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Supabase getContactById error:', error);
    throw error;
  }

  return mapContact(data);
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<void> {
  const payload: any = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.sentAt !== undefined) payload.sent_at = updates.sentAt ? new Date(updates.sentAt).toISOString() : null;

  const { error } = await getSupabaseClient()
    .from('contacts')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Supabase updateContact error:', error);
    throw error;
  }
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('contacts').delete().eq('id', id);

  if (error) {
    console.error('Supabase deleteContact error:', error);
    throw error;
  }
}

export async function deleteAllContacts(): Promise<void> {
  const { error } = await getSupabaseClient().from('contacts').delete();

  if (error) {
    console.error('Supabase deleteAllContacts error:', error);
    throw error;
  }
}

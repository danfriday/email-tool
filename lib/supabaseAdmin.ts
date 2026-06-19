import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. SERVER-ONLY — bypasses RLS, so it must
 * never be imported into a client component. All privileged DB access in
 * the API layer goes through here.
 */
let client: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const bucket =
  process.env.SUPABASE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'flier';

export function getPublicFileUrl(fileName: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!baseUrl) {
    throw new Error('Missing Supabase public URL');
  }
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${encodeURIComponent(fileName)}`;
}

export async function uploadFileToBucket(
  fileName: string,
  fileData: Buffer,
  contentType = 'image/jpeg'
) {
  const { data, error } = await getAdminClient()
    .storage.from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });
  if (error) throw error;
  return data;
}

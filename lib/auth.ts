import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Thrown by requireUser when the request is unauthenticated. */
export class AuthError extends Error {
  status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verify the request carries a valid Supabase session. Returns the user or
 * throws AuthError. Use at the top of every protected route handler.
 */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new AuthError();
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Standard error responder used by route handlers. */
export function errorResponse(err: unknown): NextResponse {
  const status =
    err && typeof err === 'object' && 'status' in err && typeof (err as any).status === 'number'
      ? (err as any).status
      : 500;
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (status >= 500) console.error('API error:', err);
  return NextResponse.json({ success: false, error: message }, { status });
}

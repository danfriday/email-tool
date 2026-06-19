import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { rateLimit } from '@/lib/rateLimit';

const PUBLIC_PATHS = ['/login'];
// Secret-verified endpoints that must bypass the session gate:
//  - /api/webhooks  : Resend Svix signature
//  - /api/cron      : x-cron-secret (service-role key)
const PUBLIC_API = ['/api/webhooks', '/api/cron'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Rate limiting for the API surface ----
  if (pathname.startsWith('/api') && !pathname.startsWith('/api/webhooks') && !pathname.startsWith('/api/cron')) {
    const ip =
      req.headers.get('x-nf-client-connection-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const { ok, retryAfter } = rateLimit(`api:${ip}`, 120, 60_000); // 120 req/min/ip
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }
  }

  // ---- Session refresh (keeps the auth cookie fresh) ----
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (isPublic(pathname)) {
    // Already signed in? Bounce away from the login page.
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return res;
  }

  if (!user) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
};

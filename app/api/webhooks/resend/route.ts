import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { markContactsBouncedByEmail } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Resend webhook receiver. Configure in the Resend dashboard pointing at
 * `https://<your-domain>/api/webhooks/resend` and subscribe to the
 * `email.bounced` and `email.complained` events.
 *
 * On a hard bounce or complaint we flag the contact as `bounced` so future
 * send runs skip it automatically.
 *
 * Security (in priority order):
 *   1. RESEND_WEBHOOK_SIGNING_SECRET (whsec_...) — verifies Resend's Svix
 *      signature on every request. This is the recommended setup.
 *   2. RESEND_WEBHOOK_TOKEN — legacy shared secret via `?token=` query param.
 *   3. Neither set — endpoint is open (not recommended for production).
 */

const BOUNCE_EVENTS = new Set(['email.bounced', 'email.complained']);
const SVIX_TOLERANCE_SECONDS = 5 * 60; // reject replays older than 5 minutes

function extractRecipients(data: any): string[] {
  if (!data) return [];
  const out: string[] = [];
  const to = data.to ?? data.email ?? data.recipient;
  if (Array.isArray(to)) out.push(...to.map((t) => String(t)));
  else if (typeof to === 'string') out.push(to);
  return out.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Verify a Resend (Svix) webhook signature against the raw request body. */
function verifySvixSignature(secret: string, req: NextRequest, rawBody: string): boolean {
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Guard against replayed deliveries.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SVIX_TOLERANCE_SECONDS) {
    return false;
  }

  // Secret is `whsec_<base64-key>`; the HMAC key is the decoded portion.
  const keyB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(keyB64, 'base64');

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  // Header is a space-separated list of `v1,<signature>` entries.
  return signatureHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const signingSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
    const sharedToken = process.env.RESEND_WEBHOOK_TOKEN;

    if (signingSecret) {
      if (!verifySvixSignature(signingSecret, request, rawBody)) {
        return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
      }
    } else if (sharedToken) {
      const token = new URL(request.url).searchParams.get('token');
      if (token !== sharedToken) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const type: string = event?.type || '';
    if (!BOUNCE_EVENTS.has(type)) {
      // Acknowledge non-bounce events so Resend doesn't retry them.
      return NextResponse.json({ success: true, ignored: type || 'unknown' });
    }

    const recipients = extractRecipients(event?.data);
    if (!recipients.length) {
      return NextResponse.json({ success: true, marked: 0 });
    }

    const marked = await markContactsBouncedByEmail(recipients);
    return NextResponse.json({ success: true, marked });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getContactsByIds, updateContact } from '@/lib/supabase';
import { getEmailTemplate, interpolateEmail } from '@/lib/emailTemplates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Resend free tier allows ~2 requests/second. 600ms keeps us safely under it.
// Override with RESEND_SEND_DELAY_MS for paid plans with higher limits.
const SEND_DELAY_MS = Number(process.env.RESEND_SEND_DELAY_MS) || 600;
const MAX_BATCH = 100;
const MAX_ATTEMPTS = 3;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Resend API key: RESEND_API_KEY');
  }
  return new Resend(apiKey);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ErrorKind = 'rate' | 'permanent' | 'transient';

/** Decide whether a Resend failure is retryable, a hard bounce, or transient. */
function classifyError(message: string): ErrorKind {
  const m = (message || '').toLowerCase();
  if (m.includes('rate') || m.includes('429') || m.includes('too many')) return 'rate';
  if (
    m.includes('invalid') ||
    m.includes('not a valid') ||
    m.includes('validation') ||
    m.includes('bounce') ||
    m.includes('suppress') ||
    m.includes('blocked') ||
    m.includes('does not exist') ||
    m.includes('unknown recipient') ||
    m.includes('no such user')
  ) {
    return 'permanent';
  }
  return 'transient';
}

interface SendEmailRequest {
  contactIds: string[];
  templateName?: string;
  contactData?: Array<{ id: string; name: string; email: string }>;
  fromEmail?: string;
  fromName?: string;
  flyerImageUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendEmailRequest = await request.json();
    const {
      contactIds,
      templateName = 'praise-party',
      contactData = [],
      fromEmail = process.env.FROM_EMAIL || 'noreply@resend.dev',
      fromName = process.env.FROM_NAME || 'Praise Party 3.0',
      flyerImageUrl = '/api/flyer',
    } = body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No contactIds provided' },
        { status: 400 }
      );
    }
    if (contactIds.length > MAX_BATCH) {
      return NextResponse.json(
        { success: false, error: `Too many contacts in one batch (max ${MAX_BATCH})` },
        { status: 400 }
      );
    }

    const template = getEmailTemplate(templateName);
    const resend = getResendClient();
    const dataById = new Map(contactData.map((c) => [c.id, c]));

    // One batched read instead of N round-trips.
    const records = await getContactsByIds(contactIds);
    const results: Array<Record<string, unknown>> = [];

    for (const contactId of contactIds) {
      const record = records.get(contactId);

      if (!record) {
        results.push({ id: contactId, success: false, error: 'Contact not found' });
        continue;
      }

      // Never re-send to already-sent or bounced addresses.
      if (record.status === 'sent') {
        results.push({ id: contactId, success: false, skipped: true, error: 'Already sent previously, skipped' });
        continue;
      }
      if (record.status === 'bounced') {
        results.push({ id: contactId, success: false, skipped: true, error: 'Previously bounced, skipped' });
        continue;
      }

      const contact = dataById.get(contactId) || {
        id: record.id as string,
        name: record.name,
        email: record.email,
      };

      const personalized = interpolateEmail(template, contact.name, contact.email, flyerImageUrl);

      let attempt = 0;
      let lastError = '';
      let sent = false;
      let messageId: string | undefined;
      let kind: ErrorKind = 'transient';

      while (attempt < MAX_ATTEMPTS && !sent) {
        attempt += 1;
        try {
          const response = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: contact.email,
            subject: personalized.subject,
            html: personalized.html,
            text: personalized.text,
          });

          if ('error' in response && response.error) {
            throw new Error(response.error.message || 'Resend API error');
          }

          messageId = (response as any).data?.id || (response as any).id;
          sent = true;
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
          kind = classifyError(lastError);
          // Hard failures (invalid/bounced) won't improve on retry.
          if (kind === 'permanent') break;
          // Rate-limited or transient: back off and retry.
          if (attempt < MAX_ATTEMPTS) await sleep(SEND_DELAY_MS * attempt * 2);
        }
      }

      if (sent) {
        try {
          await updateContact(contactId, { status: 'sent', sentAt: Date.now() });
        } catch (updateError) {
          console.error('Failed to mark contact sent:', updateError);
        }
        results.push({ id: contactId, success: true, messageId });
      } else {
        const finalStatus = kind === 'permanent' ? 'bounced' : 'failed';
        try {
          await updateContact(contactId, { status: finalStatus });
        } catch (updateError) {
          console.error('Failed to mark contact failed:', updateError);
        }
        results.push({
          id: contactId,
          success: false,
          bounced: finalStatus === 'bounced',
          error: lastError || 'Send failed',
        });
      }

      await sleep(SEND_DELAY_MS);
    }

    return NextResponse.json({
      success: true,
      results,
      sentCount: results.filter((r) => r.success).length,
      bouncedCount: results.filter((r) => (r as any).bounced).length,
      skippedCount: results.filter((r) => (r as any).skipped).length,
      failedCount: results.filter((r) => !r.success && !(r as any).skipped).length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

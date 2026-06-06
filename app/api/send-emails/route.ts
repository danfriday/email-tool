import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getContactById, updateContact } from '@/lib/supabase';
import { getEmailTemplate, interpolateEmail } from '@/lib/emailTemplates';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Resend API key: RESEND_API_KEY');
  }
  return new Resend(apiKey);
}

interface SendEmailRequest {
  contactIds: string[];
  templateName?: string;
  contactData: Array<{
    id: string;
    name: string;
    email: string;
  }>;
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
      contactData,
      fromEmail = process.env.FROM_EMAIL || 'noreply@resend.dev',
      fromName = process.env.FROM_NAME || 'Praise Party 3.0',
      flyerImageUrl = '/api/flyer',
    } = body;

    const template = getEmailTemplate(templateName);
    const results = [];
    const resend = getResendClient();

    for (const contactId of contactIds) {
      let contactRecord = null;

      try {
        contactRecord = await getContactById(contactId);
      } catch (error) {
        results.push({
          id: contactId,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch contact',
        });
        continue;
      }

      if (!contactRecord) {
        results.push({
          id: contactId,
          success: false,
          error: 'Contact not found',
        });
        continue;
      }

      if (contactRecord.status === 'sent') {
        results.push({
          id: contactId,
          success: false,
          skipped: true,
          error: 'Already sent previously, skipped',
        });
        continue;
      }

      const contact =
        contactData.find((c) => c.id === contactId) ||
        ({ id: contactRecord.id as string, name: contactRecord.name, email: contactRecord.email });

      try {
        const personalizedTemplate = interpolateEmail(
          template,
          contact.name,
          contact.email,
          flyerImageUrl
        );

        const response = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: contact.email,
          subject: personalizedTemplate.subject,
          html: personalizedTemplate.html,
        });

        if ('error' in response && response.error) {
          throw new Error(response.error.message || 'Resend API error');
        }

        const messageId = (response as any).data?.id || (response as any).id;

        try {
          await updateContact(contactId, {
            status: 'sent',
            sentAt: Date.now(),
          });
        } catch (updateError) {
          console.error('Failed to mark contact sent:', updateError);
        }

        results.push({
          id: contactId,
          success: true,
          messageId,
        });
      } catch (error) {
        try {
          await updateContact(contactId, {
            status: 'failed',
          });
        } catch (updateError) {
          console.error('Failed to mark contact failed:', updateError);
        }

        results.push({
          id: contactId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        continue;
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({
      success: true,
      results,
      sentCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success && !r.skipped).length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { updateContact } from '@/lib/supabase';
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

    for (const contactId of contactIds) {
      const contact = contactData.find((c) => c.id === contactId);
      
      if (!contact) {
        results.push({
          id: contactId,
          success: false,
          error: 'Contact not found',
        });
        continue;
      }

      try {
        // Interpolate email with contact details
        const personalizedTemplate = interpolateEmail(template, contact.name, contact.email, flyerImageUrl);

        const resend = getResendClient();
        const response = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: contact.email,
          subject: personalizedTemplate.subject,
          html: personalizedTemplate.html,
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        // Update contact status in Firebase
        await updateContact(contactId, {
          status: 'sent',
          sentAt: Date.now(),
        });

        results.push({
          id: contactId,
          success: true,
          messageId: response.data?.id,
        });
      } catch (error) {
        // Update contact status to failed
        await updateContact(contactId, {
          status: 'failed',
        });

        results.push({
          id: contactId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Rate limiting: wait 100ms between emails
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({
      success: true,
      results,
      sentCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
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

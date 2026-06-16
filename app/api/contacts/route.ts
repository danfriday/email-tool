import { NextRequest, NextResponse } from 'next/server';
import {
  addContact,
  getContactByEmail,
  getContacts,
  updateContact,
  deleteContact,
  deleteAllContacts,
} from '@/lib/supabase';
import { EMAIL_REGEX, normalizeEmail, parseName } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const contacts = await getContacts();
    return NextResponse.json({ success: true, contacts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const existing = await getContactByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'A contact with this email already exists',
          contact: existing,
        },
        { status: 409 }
      );
    }

    const parsedName = name ? name : parseName(normalizedEmail.split('@')[0]);

    const contactId = await addContact({
      name: parsedName,
      email: normalizedEmail,
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      contact: {
        id: contactId,
        name: parsedName,
        email,
        status: 'pending',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    await updateContact(id, updates);

    return NextResponse.json({
      success: true,
      message: 'Contact updated',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteAll = searchParams.get('deleteAll') === 'true';

    if (deleteAll) {
      await deleteAllContacts();
      return NextResponse.json({ success: true, message: 'All contacts deleted' });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    await deleteContact(id);

    return NextResponse.json({
      success: true,
      message: 'Contact deleted',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

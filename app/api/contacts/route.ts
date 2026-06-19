import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import {
  listContacts,
  addContact,
  updateContact,
  deleteContacts,
  deleteAllContacts,
  getContactByEmail,
} from '@/lib/services/contacts';
import { logActivity } from '@/lib/logger';
import {
  isValidEmail,
  normalizeEmail,
  sanitizeText,
  clampInt,
  asUuidArray,
  ValidationError,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const result = await listContacts({
      page: clampInt(sp.get('page'), 1, 1_000_000, 1),
      pageSize: clampInt(sp.get('pageSize'), 1, 500, 50),
      search: sanitizeText(sp.get('search') ?? '', 100) || undefined,
      filter: (['all', 'active', 'suppressed'].includes(sp.get('filter') ?? '')
        ? sp.get('filter')
        : 'all') as 'all' | 'active' | 'suppressed',
      sort: (['created_at', 'name', 'email'].includes(sp.get('sort') ?? '')
        ? sp.get('sort')
        : 'created_at') as 'created_at' | 'name' | 'email',
      order: (sp.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
      listId: sp.get('listId') || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    if (!isValidEmail(body.email)) {
      throw new ValidationError('Invalid email address');
    }
    const email = normalizeEmail(body.email);
    const existing = await getContactByEmail(email);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A contact with this email already exists', contact: existing },
        { status: 409 }
      );
    }
    const name = sanitizeText(body.name ?? '', 120);
    const contact = await addContact({ name, email });
    await logActivity('contact', 'info', `Contact added: ${email}`, {
      contactId: contact.id, actor: user.email,
    });
    return NextResponse.json({ success: true, contact });
  } catch (err) {
    return errorResponse(err);
  }
}

// Update a single contact, or batch-suppress/unsuppress.
export async function PATCH(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();

    // Batch suppression toggle: { ids: [...], suppressed: bool }
    if (Array.isArray(body.ids)) {
      const ids = asUuidArray(body.ids);
      const suppressed = !!body.suppressed;
      let count = 0;
      for (const id of ids) {
        await updateContact(id, { suppressed });
        count++;
      }
      return NextResponse.json({ success: true, updated: count });
    }

    // Single update
    if (!body.id) throw new ValidationError('Contact id is required');
    const updates: { name?: string; email?: string; suppressed?: boolean } = {};
    if (body.name !== undefined) updates.name = sanitizeText(body.name, 120);
    if (body.email !== undefined) {
      if (!isValidEmail(body.email)) throw new ValidationError('Invalid email address');
      updates.email = normalizeEmail(body.email);
    }
    if (body.suppressed !== undefined) updates.suppressed = !!body.suppressed;
    await updateContact(body.id, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete by ?id=, batch via body { ids: [...] }, or ?deleteAll=true
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;

    if (sp.get('deleteAll') === 'true') {
      await deleteAllContacts();
      await logActivity('contact', 'warn', 'All contacts deleted', { actor: user.email });
      return NextResponse.json({ success: true, message: 'All contacts deleted' });
    }

    const id = sp.get('id');
    let ids: string[] = [];
    if (id) {
      ids = asUuidArray([id]);
    } else {
      const body = await request.json().catch(() => ({}));
      ids = asUuidArray(body.ids);
    }
    if (!ids.length) throw new ValidationError('No valid contact ids provided');

    const deleted = await deleteContacts(ids);
    await logActivity('contact', 'info', `Deleted ${deleted} contact(s)`, { actor: user.email });
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    return errorResponse(err);
  }
}

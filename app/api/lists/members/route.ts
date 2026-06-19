import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { addContactsToList, removeContactsFromList } from '@/lib/services/lists';
import { asUuidArray, isUuid, ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add contacts to a list: { listId, contactIds: [] }
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    if (!isUuid(body.listId)) throw new ValidationError('Valid listId is required');
    const contactIds = asUuidArray(body.contactIds);
    if (!contactIds.length) throw new ValidationError('No valid contactIds provided');
    const added = await addContactsToList(body.listId, contactIds);
    return NextResponse.json({ success: true, added });
  } catch (err) {
    return errorResponse(err);
  }
}

// Remove contacts from a list: { listId, contactIds: [] }
export async function DELETE(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    if (!isUuid(body.listId)) throw new ValidationError('Valid listId is required');
    const contactIds = asUuidArray(body.contactIds);
    if (!contactIds.length) throw new ValidationError('No valid contactIds provided');
    const removed = await removeContactsFromList(body.listId, contactIds);
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    return errorResponse(err);
  }
}

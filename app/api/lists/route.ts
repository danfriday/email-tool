import { NextRequest, NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { listLists, createList, renameList, deleteList } from '@/lib/services/lists';
import { logActivity } from '@/lib/logger';
import { sanitizeText, isUuid, ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const search = sanitizeText(request.nextUrl.searchParams.get('search') ?? '', 100) || undefined;
    const lists = await listLists(search);
    return NextResponse.json({ success: true, lists });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const name = sanitizeText(body.name ?? '', 80);
    if (!name) throw new ValidationError('List name is required');
    const description = body.description ? sanitizeText(body.description, 300) : undefined;
    const list = await createList(name, description);
    await logActivity('list', 'info', `List created: ${name}`, { actor: user.email });
    return NextResponse.json({ success: true, list });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ success: false, error: 'A list with this name already exists' }, { status: 409 });
    }
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    if (!isUuid(body.id)) throw new ValidationError('Valid list id is required');
    const name = sanitizeText(body.name ?? '', 80);
    if (!name) throw new ValidationError('List name is required');
    const description = body.description !== undefined ? sanitizeText(body.description, 300) : undefined;
    await renameList(body.id, name, description);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ success: false, error: 'A list with this name already exists' }, { status: 409 });
    }
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const id = request.nextUrl.searchParams.get('id');
    if (!isUuid(id)) throw new ValidationError('Valid list id is required');
    await deleteList(id as string);
    await logActivity('list', 'info', 'List deleted', { actor: user.email });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

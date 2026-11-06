import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!numId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  getDb().prepare('DELETE FROM vocab WHERE id = ?').run(numId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!numId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  if (typeof body.writing_rotate === 'boolean' || typeof body.writing_rotate === 'number') {
    db.prepare('UPDATE vocab SET writing_rotate = ? WHERE id = ?').run(body.writing_rotate ? 1 : 0, numId);
  }
  return NextResponse.json({ ok: true });
}

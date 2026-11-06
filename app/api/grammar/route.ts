import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tips = getDb()
    .prepare('SELECT * FROM grammar_tips ORDER BY created_at DESC LIMIT 100')
    .all();
  return NextResponse.json({ tips });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  getDb().prepare('DELETE FROM grammar_tips WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

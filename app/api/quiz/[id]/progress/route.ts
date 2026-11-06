import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const row = getDb().prepare('SELECT state, updated_at FROM quiz_progress WHERE user = ? AND quiz_id = ?').get(user, id) as any;
  if (!row) return NextResponse.json({ state: null });
  let state: any = null;
  try { state = JSON.parse(row.state); } catch {}
  return NextResponse.json({ state, updated_at: row.updated_at });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const state = body?.state;
  if (state == null) return NextResponse.json({ error: 'state required' }, { status: 400 });
  getDb().prepare(`
    INSERT INTO quiz_progress(user, quiz_id, state, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(user, quiz_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `).run(user, id, JSON.stringify(state), Date.now());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM quiz_progress WHERE user = ? AND quiz_id = ?').run(user, id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addXp, getDb } from '@/lib/db';
import { sm2, nextDueAt } from '@/lib/srs';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, quality } = await req.json();
  if (typeof id !== 'number' || typeof quality !== 'number') {
    return NextResponse.json({ error: 'id and quality required' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM vocab WHERE id = ?').get(id) as any;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const next = sm2({ ease: row.ease, interval_days: row.interval_days, repetitions: row.repetitions }, quality);
  const due = nextDueAt(next.interval_days);
  db.prepare('UPDATE vocab SET ease = ?, interval_days = ?, repetitions = ?, due_at = ?, last_reviewed_at = ? WHERE id = ?')
    .run(next.ease, next.interval_days, next.repetitions, due, Date.now(), id);
  if (quality >= 3) addXp(2);
  return NextResponse.json({ ok: true, next, due_at: due });
}

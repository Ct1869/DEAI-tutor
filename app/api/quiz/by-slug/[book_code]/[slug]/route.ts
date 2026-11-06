import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function DELETE(req: Request, ctx: { params: Promise<{ book_code: string; slug: string }> }) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { book_code, slug } = await ctx.params;
  const db = getDb();
  const quiz = db.prepare('SELECT id FROM quizzes WHERE book_code = ? AND slug = ?').get(book_code, slug) as any;
  if (!quiz) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const id = quiz.id as number;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM answers WHERE quiz_id = ?').run(id);
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(id);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
  });
  tx();
  return NextResponse.json({ ok: true, id });
}

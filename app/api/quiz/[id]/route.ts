import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const db = getDb();
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) as any;
  if (!quiz) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const questions = db.prepare(`SELECT q.id, q.position, q.type, q.prompt, q.data, q.answer, q.explanation, q.audio_text,
    qm.repetitions AS mastery_repetitions, qm.correct_streak AS mastery_streak,
    qm.due_at AS mastery_due_at, qm.attempts AS mastery_attempts
    FROM questions q LEFT JOIN question_mastery qm ON qm.question_id = q.id
    WHERE q.quiz_id = ? ORDER BY q.position`).all(id) as any[];
  questions.forEach((q) => { try { q.data = JSON.parse(q.data); } catch {} });
  return NextResponse.json({ quiz, questions });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const db = getDb();
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(id) as any;
  if (!quiz) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM answers WHERE quiz_id = ?').run(id);
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(id);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
  });
  tx();
  return NextResponse.json({ ok: true, id: Number(id) });
}

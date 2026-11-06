import { NextResponse } from 'next/server';
import { getDb, getStat, today } from '@/lib/db';
import { sendToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';

function checkKey(req: Request) {
  const key = req.headers.get('x-api-key');
  return key && key === process.env.QUIZ_API_KEY;
}

export async function POST(req: Request) {
  if (!checkKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await sendToAll({
    title: body.title || 'Deutsch',
    body: body.body || 'Zeit zum Lernen!',
    url: body.url || '/',
    tag: body.tag || 'manual',
  });
  return NextResponse.json(result);
}

// Called by cron — decides whether to send a reminder based on due vocab + streak state
export async function GET(req: Request) {
  if (!checkKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getDb();
  const now = Date.now();
  const due = (db.prepare('SELECT COUNT(*) AS c FROM vocab WHERE due_at <= ?').get(now) as any).c as number;
  const t = today();
  const last = getStat('last_active_date');
  const todaysQuizzes = (db.prepare("SELECT COUNT(*) AS c FROM quizzes WHERE scheduled_for = ? AND completed = 0").get(t) as any).c as number;
  const streak = parseInt(getStat('streak', '0') || '0', 10);

  let title = '';
  let body = '';
  if (last !== t && streak > 0) {
    title = `🔥 Streak ${streak} in Gefahr`;
    body = `Heute noch nichts gemacht — schnell eine Übung, sonst ist die Serie weg.`;
  } else if (todaysQuizzes > 0) {
    title = '📚 Quiz für heute';
    body = `Du hast ${todaysQuizzes} Quiz heute — los geht's.`;
  } else if (due >= 10) {
    title = '🧠 Vokabeln fällig';
    body = `${due} Wörter warten auf Review.`;
  } else {
    return NextResponse.json({ skipped: true, reason: 'nothing to remind', due, todaysQuizzes, streak });
  }
  const result = await sendToAll({ title, body, url: '/' });
  return NextResponse.json({ ...result, title, body });
}

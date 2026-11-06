import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { chat } from '@/lib/llm';
import { displayVocabWord } from '@/lib/vocab-word';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function extractObject(text: string): any | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const level = ['A1', 'A2', 'B1', 'B2', 'C1'].includes(body?.level) ? body.level : 'B1';

  // A few of the learner's due/known words to weave in (soft nudge, not a test).
  const db = getDb();
  const now = Date.now();
  const rows = db.prepare(
    `SELECT word, translation, article FROM vocab
     WHERE translation IS NOT NULL AND word IS NOT NULL
     ORDER BY (due_at <= ?) DESC, due_at ASC LIMIT 12`
  ).all(now) as Array<{ word: string; translation: string | null; article: string | null }>;
  const pool = rows.sort(() => Math.random() - 0.5).slice(0, 3);
  const words = pool.map((w) => displayVocabWord(w.word, w.article));

  const system = 'You are a friendly German writing coach for an Egyptian learner. Return ONLY a JSON object — no markdown, no commentary.';
  const userMsg = [
    `Invent ONE short, engaging free-writing topic for a CEFR ${level} German learner.`,
    'It should be personal and easy to have an opinion or story about (daily life, plans, memories, preferences).',
    words.length ? `If it fits naturally, the learner may try to use these words: ${words.join(', ')}.` : '',
    'Return a JSON object with keys:',
    '"topic" (a short German title, 2-5 words),',
    '"instruction" (one friendly German sentence telling them what to write, e.g. "Schreib 3-4 Sätze darüber, ..."),',
    '"en" (a one-line English gloss of the instruction).',
    'No other text.',
  ].filter(Boolean).join('\n');

  let text = '';
  try {
    text = await chat([{ role: 'user', content: userMsg }], 400, system);
  } catch (e: any) {
    return NextResponse.json({ error: 'generation_failed', detail: String(e?.message || e) }, { status: 502 });
  }
  const obj = extractObject(text);
  if (!obj?.topic || !obj?.instruction) {
    return NextResponse.json({ error: 'parse_failed' }, { status: 502 });
  }
  return NextResponse.json({
    topic: String(obj.topic).slice(0, 80),
    instruction: String(obj.instruction).slice(0, 240),
    en: obj.en ? String(obj.en).slice(0, 240) : null,
    words,
    level,
  });
}

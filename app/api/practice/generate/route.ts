import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { chat } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Card = { id: string; level: string; topic: string; de: string; en: string; ar: string };

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

function extractArray(text: string): any[] | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try { const p = JSON.parse(slice); return Array.isArray(p) ? p : null; } catch { return null; }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const level = LEVELS.includes(body?.level) ? body.level : 'B2';
  const count = Math.min(12, Math.max(3, Number(body?.count) || 8));
  const avoid: string[] = Array.isArray(body?.avoid) ? body.avoid.slice(0, 40) : [];

  const system = 'You are a German teacher creating example sentences for an Egyptian learner (learning German, native Egyptian Arabic, good English). Return ONLY a JSON array — no markdown fences, no commentary, no <thinking> tags.';
  const userMsg = [
    `Generate ${count} natural, genuinely useful German sentences at CEFR level ${level}.`,
    'Vary the topics widely (daily life, work, health, opinions, plans, feelings, travel, money, technology).',
    'Each sentence must sound like real spoken/written German a person would actually use — not textbook filler.',
    avoid.length ? `Do NOT repeat these German sentences: ${avoid.join(' | ')}` : '',
    'For each item return an object with keys:',
    '"topic" (1-2 word German label, e.g. "Alltag", "Arbeit"),',
    '"de" (the German sentence),',
    '"en" (natural English translation),',
    '"ar" (Egyptian Arabic translation, written in Arabic script).',
    `Return a JSON array of exactly ${count} objects. No other text.`,
  ].filter(Boolean).join('\n');

  let text = '';
  try {
    text = await chat([{ role: 'user', content: userMsg }], 1600, system);
  } catch (e: any) {
    return NextResponse.json({ error: 'generation_failed', detail: String(e?.message || e) }, { status: 502 });
  }

  const arr = extractArray(text);
  if (!arr) return NextResponse.json({ error: 'parse_failed' }, { status: 502 });

  const stamp = Date.now();
  const cards: Card[] = arr
    .filter((c) => c && typeof c.de === 'string' && c.de.trim())
    .map((c, i) => ({
      id: `gen-${stamp}-${i}`,
      level,
      topic: String(c.topic || 'Satz').slice(0, 40),
      de: String(c.de).trim(),
      en: String(c.en || '').trim(),
      ar: String(c.ar || '').trim(),
    }));

  if (!cards.length) return NextResponse.json({ error: 'empty' }, { status: 502 });
  return NextResponse.json({ cards });
}

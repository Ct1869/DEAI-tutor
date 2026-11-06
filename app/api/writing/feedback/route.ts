import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { chat } from '@/lib/llm';
import { getDb } from '@/lib/db';
import { normalizeVocabWord } from '@/lib/vocab-word';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function extractObject(text: string): any | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function saveAutoVocab(db: ReturnType<typeof getDb>, raw: unknown, example: string) {
  if (!Array.isArray(raw)) return [];
  const added: Array<{ word: string; translation: string; article?: string }> = [];
  const now = Date.now();
  for (const item of raw.slice(0, 2)) {
    const translation = String((item as any)?.translation || '').trim();
    if (!(item as any)?.word || !translation) continue;
    const { word, article } = normalizeVocabWord(String((item as any).word), (item as any).article);
    if (!word) continue;
    const res = db
      .prepare(`INSERT INTO vocab(word, translation, article, example, source, due_at, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(word) DO NOTHING`)
      .run(word, translation, article, example, 'writing', now, now);
    if (res.changes > 0) added.push({ word, translation, ...(article ? { article } : {}) });
  }
  return added;
}

function saveGrammarTip(db: ReturnType<typeof getDb>, tip: unknown) {
  const t = tip as any;
  if (!t || !t.rule || !t.example) return;
  db.prepare(`INSERT INTO grammar_tips(trigger_phrase, rule, example, memory_hook, created_at)
              VALUES(?, ?, ?, ?, ?)`)
    .run(String(t.trigger || '').slice(0, 200), String(t.rule), String(t.example), String(t.memory_hook || ''), Date.now());
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const text = String(body?.text || '').trim();
  const topic = String(body?.topic || '').trim();
  const words: string[] = Array.isArray(body?.words) ? body.words.map((w: any) => String(w)) : [];
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const system = 'You are a warm, encouraging German writing coach for an Egyptian learner. You NEVER shame mistakes. Return ONLY a JSON object — no markdown, no commentary.';
  const userMsg = [
    topic ? `The learner wrote this in German about the topic "${topic}":` : 'The learner wrote this in German:',
    `"""${text}"""`,
    words.length ? `They were nudged to try these words: ${words.join(', ')}.` : '',
    'Reply with a JSON object with keys:',
    '"natural" (the same text rewritten as a native speaker would naturally say it, keeping the learner\'s meaning),',
    '"feedback" (2-3 warm, specific German sentences: what was good + the one or two most useful things to improve),',
    '"corrections" (array of up to 4 objects {"wrong": "...", "right": "...", "why": "short German reason"} for concrete fixes; empty array if none),',
    '"used_words" (array of the nudge words that actually appeared, correctly used),',
    '"score" (integer 1-5, generous — reward communication over perfection),',
    '"grammar_tip" (object {"trigger": "...", "rule": "...", "example": "...", "memory_hook": "..."} in German for the single most useful rule this text shows the learner still needs; null if nothing stands out),',
    '"auto_vocab" (array of up to 2 objects {"word": "...", "translation": "...", "article": "der|die|das or null"} for genuinely useful German words the learner clearly did not know; empty array if none).',
    'No other text.',
  ].filter(Boolean).join('\n');

  let raw = '';
  try {
    raw = await chat([{ role: 'user', content: userMsg }], 900, system);
  } catch (e: any) {
    return NextResponse.json({ error: 'grading_failed', detail: String(e?.message || e) }, { status: 502 });
  }
  const obj = extractObject(raw);
  if (!obj) return NextResponse.json({ error: 'parse_failed' }, { status: 502 });

  // The writing rewrite moved off /api/writing/grade, which is what used to feed
  // the Grammatik page and auto-add unknown words. Keep both fed from here.
  const db = getDb();
  const added = saveAutoVocab(db, obj.auto_vocab, text);
  saveGrammarTip(db, obj.grammar_tip);

  return NextResponse.json({
    auto_added_words: added,
    natural: obj.natural ? String(obj.natural) : null,
    feedback: obj.feedback ? String(obj.feedback) : null,
    corrections: Array.isArray(obj.corrections)
      ? obj.corrections.slice(0, 4).map((c: any) => ({ wrong: String(c?.wrong || ''), right: String(c?.right || ''), why: String(c?.why || '') })).filter((c: any) => c.right)
      : [],
    used_words: Array.isArray(obj.used_words) ? obj.used_words.map((w: any) => String(w)) : [],
    score: Math.max(1, Math.min(5, Number(obj.score) || 3)),
  });
}

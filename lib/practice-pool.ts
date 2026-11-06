import { getDb } from './db';
import { chat } from './llm';

export const POOL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type PoolLevel = (typeof POOL_LEVELS)[number];

/** Keep at least this many unseen sentences per level so a refresh is always fresh. */
export const TARGET_UNSEEN = 24;

export type PoolCard = { id: string; level: string; topic: string; de: string; en: string; ar: string };

type Row = { id: number; level: string; topic: string | null; de: string; en: string | null; ar: string | null };

function toCard(r: Row): PoolCard {
  return {
    id: `pool-${r.id}`,
    level: r.level,
    topic: r.topic || 'Satz',
    de: r.de,
    en: r.en || '',
    ar: r.ar || '',
  };
}

export function unseenCount(level: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM practice_pool WHERE level = ? AND served_at = 0')
    .get(level) as { c: number };
  return row?.c ?? 0;
}

/**
 * Hands out the least-recently-served sentences and marks them served, so each
 * visit rotates instead of replaying the same batch.
 */
export function takeFromPool(level: string, count: number): PoolCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, level, topic, de, en, ar FROM practice_pool
       WHERE level = ?
       ORDER BY served_at ASC, serve_count ASC, RANDOM()
       LIMIT ?`
    )
    .all(level, count) as Row[];
  if (rows.length) {
    const now = Date.now();
    const mark = db.prepare('UPDATE practice_pool SET served_at = ?, serve_count = serve_count + 1 WHERE id = ?');
    db.transaction((list: Row[]) => { for (const r of list) mark.run(now, r.id); })(rows);
  }
  return rows.map(toCard);
}

function extractArray(text: string): any[] | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/** Generates a batch and stores it. Returns how many new rows landed. */
export async function refillLevel(level: string, count = 12): Promise<number> {
  const db = getDb();
  const recent = (db
    .prepare('SELECT de FROM practice_pool WHERE level = ? ORDER BY id DESC LIMIT 40')
    .all(level) as Array<{ de: string }>).map((r) => r.de);

  const system =
    'You are a German teacher creating example sentences for an Egyptian learner (learning German, native Egyptian Arabic, good English). Return ONLY a JSON array — no markdown fences, no commentary.';
  const userMsg = [
    `Generate ${count} natural, genuinely useful German sentences at CEFR level ${level}.`,
    'Vary the topics widely (daily life, work, health, opinions, plans, feelings, travel, money, technology).',
    'Each sentence must sound like real spoken/written German a person would actually use — not textbook filler.',
    recent.length ? `Do NOT repeat or closely paraphrase these: ${recent.slice(0, 25).join(' | ')}` : '',
    'For each item return an object with keys:',
    '"topic" (1-2 word German label, e.g. "Alltag", "Arbeit"),',
    '"de" (the German sentence),',
    '"en" (natural English translation),',
    '"ar" (Egyptian Arabic translation, in Arabic script).',
    `Return a JSON array of exactly ${count} objects. No other text.`,
  ].filter(Boolean).join('\n');

  const raw = await chat([{ role: 'user', content: userMsg }], 1800, system);
  const arr = extractArray(raw);
  if (!arr) return 0;

  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO practice_pool(level, topic, de, en, ar, created_at)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(de) DO NOTHING`
  );
  let added = 0;
  db.transaction((items: any[]) => {
    for (const c of items) {
      const de = String(c?.de || '').trim();
      if (!de) continue;
      const res = insert.run(level, String(c?.topic || 'Satz').slice(0, 40), de, String(c?.en || '').trim(), String(c?.ar || '').trim(), now);
      added += res.changes;
    }
  })(arr);
  return added;
}

// One refill per level at a time — the page can fire several requests at once.
const inFlight = new Set<string>();

export function refillInBackground(level: string) {
  if (inFlight.has(level) || unseenCount(level) >= TARGET_UNSEEN) return;
  inFlight.add(level);
  refillLevel(level)
    .catch(() => {})
    .finally(() => inFlight.delete(level));
}

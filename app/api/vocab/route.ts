import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { normalizeVocabWord } from '@/lib/vocab-word';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user && !checkApiKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const due = url.searchParams.get('due');
  const db = getDb();
  const rows = due
    ? db.prepare('SELECT * FROM vocab WHERE due_at <= ? ORDER BY due_at ASC').all(Date.now())
    : db.prepare('SELECT * FROM vocab ORDER BY created_at DESC LIMIT 500').all();
  return NextResponse.json({ vocab: rows });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { word, translation, article, example, examples, family, notes, source } = body || {};
  if (!word) return NextResponse.json({ error: 'word required' }, { status: 400 });
  const norm = normalizeVocabWord(word, article);
  const db = getDb();
  const now = Date.now();
  const examplesJson = examples && Array.isArray(examples) && examples.length > 0
    ? JSON.stringify(examples)
    : null;
  const familyJson = family && Array.isArray(family) && family.length > 0
    ? JSON.stringify(family)
    : null;
  db.prepare(`INSERT INTO vocab(word, translation, article, example, examples, family, source, notes, due_at, created_at)
              VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(word) DO UPDATE SET
                translation = COALESCE(excluded.translation, vocab.translation),
                article = COALESCE(excluded.article, vocab.article),
                example = COALESCE(excluded.example, vocab.example),
                examples = COALESCE(excluded.examples, vocab.examples),
                family = COALESCE(excluded.family, vocab.family),
                source = COALESCE(excluded.source, vocab.source),
                notes = COALESCE(excluded.notes, vocab.notes)`)
    .run(norm.word, translation || null, norm.article, example || null, examplesJson, familyJson, source || null, notes || null, now, now);
  return NextResponse.json({ ok: true });
}

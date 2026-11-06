import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { normalizeVocabWord } from '@/lib/vocab-word';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { word, translation, article, example, examples, family, notes } = await req.json();
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
  db.prepare(`INSERT INTO vocab(word, translation, article, example, examples, family, notes, due_at, created_at)
              VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(word) DO UPDATE SET
                translation = COALESCE(excluded.translation, vocab.translation),
                article = COALESCE(excluded.article, vocab.article),
                example = COALESCE(excluded.example, vocab.example),
                examples = COALESCE(excluded.examples, vocab.examples),
                family = COALESCE(excluded.family, vocab.family),
                notes = COALESCE(excluded.notes, vocab.notes)`)
    .run(norm.word, translation || null, norm.article, example || null, examplesJson, familyJson, notes || null, now, now);
  return NextResponse.json({ ok: true });
}

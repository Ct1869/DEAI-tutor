import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb, today } from '@/lib/db';
import { validateQuizPayload } from '@/lib/quiz-schema';

// Payload schema:
// {
//   "title": "Kapitel 3 — Präteritum",
//   "source": "Book X, p.42",
//   "scheduled_for": "2026-04-19",         // optional; defaults to today
//   "questions": [
//     {
//       "type": "mcq" | "fill_blank" | "translation" | "matching" | "listening" | "typing",
//       "prompt": "Wie sagt man 'apple' auf Deutsch?",
//       "data": { ...type-specific... },
//       "answer": "Apfel" | ["Apfel", "der Apfel"] | { pairs: {...} },
//       "explanation": "Der Apfel — masculine.",
//       "audio_text": "Apfel"              // optional for listening/TTS
//     }
//   ]
// }

export async function POST(req: Request) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = validateQuizPayload(raw);
  if (!parsed.data) {
    return NextResponse.json({ error: 'invalid quiz payload', issues: parsed.validation.errors }, { status: 422 });
  }
  const body = parsed.data;
  const db = getDb();
  const lessonNumber = body.lesson_number ?? null;
  let book: { code: string | null; printed_page_start: number | null; printed_page_end: number | null; total_pdf_pages: number | null } | undefined;
  if (body.book_id != null) {
    book = db.prepare('SELECT code, printed_page_start, printed_page_end, total_pdf_pages FROM books WHERE id = ?').get(body.book_id) as typeof book;
    if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 });
    if (body.printed_page_start != null && book.printed_page_start != null && body.printed_page_start < book.printed_page_start) {
      return NextResponse.json({ error: 'printed page starts before the book content range' }, { status: 422 });
    }
    if (body.printed_page_end != null && book.printed_page_end != null && body.printed_page_end > book.printed_page_end) {
      return NextResponse.json({ error: 'printed page ends after the book content range' }, { status: 422 });
    }
    if (body.pdf_page_end != null && book.total_pdf_pages != null && body.pdf_page_end > book.total_pdf_pages) {
      return NextResponse.json({ error: 'PDF page ends after the source file' }, { status: 422 });
    }
  }
  if (lessonNumber != null && body.book_id != null) {
    const existing = db.prepare('SELECT id FROM quizzes WHERE book_id = ? AND lesson_number = ?').get(body.book_id, lessonNumber) as any;
    if (existing) {
      return NextResponse.json({ error: 'lesson_number already used', existing_quiz_id: existing.id }, { status: 409 });
    }
  }
  const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : null;
  let bookCode: string | null = null;
  if (slug) {
    if (body.book_id == null) {
      return NextResponse.json({ error: 'book_id required when slug is provided' }, { status: 400 });
    }
    book = book || db.prepare('SELECT code, printed_page_start, printed_page_end, total_pdf_pages FROM books WHERE id = ?').get(body.book_id) as typeof book;
    if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 });
    if (!book.code) return NextResponse.json({ error: 'book has no code; set books.code before assigning a slug' }, { status: 400 });
    bookCode = book.code;
    const dup = db.prepare('SELECT id FROM quizzes WHERE book_code = ? AND slug = ?').get(bookCode, slug) as any;
    if (dup) return NextResponse.json({ error: 'slug already used for this book', existing_quiz_id: dup.id }, { status: 409 });
  }
  const insertQuiz = db.prepare(`INSERT INTO quizzes(
    title, source, created_at, scheduled_for,
    book_id, pdf_page_start, pdf_page_end, printed_page_start, printed_page_end, lesson_number,
    slug, book_code
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertQ = db.prepare('INSERT INTO questions(quiz_id, position, type, prompt, data, answer, explanation, audio_text, source_ref) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    const info = insertQuiz.run(
      body.title,
      body.source || null,
      Date.now(),
      body.scheduled_for || today(),
      body.book_id ?? null,
      body.pdf_page_start ?? null,
      body.pdf_page_end ?? null,
      body.printed_page_start ?? null,
      body.printed_page_end ?? null,
      lessonNumber,
      slug,
      bookCode,
    );
    const quizId = info.lastInsertRowid as number;
    body.questions.forEach((q: any, i: number) => {
      insertQ.run(
        quizId,
        i,
        q.type || 'mcq',
        q.prompt || '',
        JSON.stringify(q.data ?? {}),
        typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer),
        q.explanation || null,
        q.audio_text || null,
        q.source_ref || null,
      );
    });
    return quizId;
  });
  const id = tx();
  const url = slug && bookCode ? `/quiz/${bookCode}/${slug}` : `/quiz/${id}`;
  return NextResponse.json({ ok: true, id, url });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || today();
  const db = getDb();
  const quizzes = db.prepare('SELECT * FROM quizzes WHERE scheduled_for = ? ORDER BY id DESC').all(date);
  return NextResponse.json({ date, quizzes });
}

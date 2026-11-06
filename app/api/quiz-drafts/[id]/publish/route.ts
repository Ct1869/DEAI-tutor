import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb, today } from '@/lib/db';
import { validateQuizPayload } from '@/lib/quiz-schema';

async function authorized(req: Request) {
  return Boolean(await getSessionUser()) || checkApiKey(req);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const draftId = Number(id);
  const db = getDb();
  const draft = db.prepare('SELECT * FROM quiz_drafts WHERE id = ?').get(draftId) as any;
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'draft') return NextResponse.json({ error: `draft is ${draft.status}, not publishable` }, { status: 409 });

  const checked = validateQuizPayload(JSON.parse(draft.payload));
  if (!checked.data) return NextResponse.json({ error: 'draft no longer validates', issues: checked.validation.errors }, { status: 422 });
  const quiz = checked.data;
  const book = db.prepare('SELECT code FROM books WHERE id = ?').get(quiz.book_id) as { code: string | null } | undefined;
  if (!book?.code) return NextResponse.json({ error: 'book needs a code before publishing' }, { status: 422 });
  const duplicate = db.prepare('SELECT id FROM quizzes WHERE book_id = ? AND lesson_number = ?').get(quiz.book_id, quiz.lesson_number) as any;
  if (duplicate) return NextResponse.json({ error: 'lesson already published', existing_quiz_id: duplicate.id }, { status: 409 });

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO quizzes(
      title, source, created_at, scheduled_for, book_id, pdf_page_start, pdf_page_end,
      printed_page_start, printed_page_end, lesson_number, slug, book_code
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      quiz.title, quiz.source || null, Date.now(), quiz.scheduled_for || today(), quiz.book_id,
      quiz.pdf_page_start, quiz.pdf_page_end, quiz.printed_page_start, quiz.printed_page_end,
      quiz.lesson_number, quiz.slug || null, book.code,
    );
    const quizId = Number(info.lastInsertRowid);
    const insertQuestion = db.prepare(`INSERT INTO questions(
      quiz_id, position, type, prompt, data, answer, explanation, audio_text, source_ref
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    quiz.questions.forEach((question, position) => insertQuestion.run(
      quizId, position, question.type, question.prompt, JSON.stringify(question.data),
      typeof question.answer === 'string' ? question.answer : JSON.stringify(question.answer),
      question.explanation, question.audio_text || null, question.source_ref || null,
    ));
    db.prepare(`UPDATE quiz_drafts SET status = 'published', published_quiz_id = ?, updated_at = ? WHERE id = ?`).run(quizId, Date.now(), draftId);
    db.prepare(`UPDATE book_sections SET status = 'published', updated_at = ? WHERE id = ?`).run(Date.now(), draft.section_id);
    db.prepare(`UPDATE book_progress SET last_pdf_page = ?, last_printed_page = ?, last_quiz_date = ?, last_quiz_id = ?, notes = ?, updated_at = ? WHERE book_id = ?`).run(
      quiz.pdf_page_end, quiz.printed_page_end, today(), quizId, quiz.title, Date.now(), quiz.book_id,
    );
    return quizId;
  });

  try {
    const quizId = tx();
    return NextResponse.json({ ok: true, id: quizId, url: `/quiz/${book.code}/${quiz.slug}` });
  } catch (error: any) {
    if (String(error?.code || '').includes('CONSTRAINT')) return NextResponse.json({ error: 'quiz conflicts with an existing lesson or slug' }, { status: 409 });
    return NextResponse.json({ error: error?.message || 'publish failed' }, { status: 500 });
  }
}

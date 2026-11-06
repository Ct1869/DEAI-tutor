import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';

export default async function LessonLookup({ params }: { params: Promise<{ book_id: string; lesson_number: string }> }) {
  const { book_id, lesson_number } = await params;
  const bookId = Number(book_id);
  const lesson = Number(lesson_number);
  if (!Number.isInteger(bookId) || !Number.isInteger(lesson)) notFound();
  const row = getDb().prepare('SELECT id FROM quizzes WHERE book_id = ? AND lesson_number = ?').get(bookId, lesson) as any;
  if (!row) notFound();
  redirect(`/quiz/${row.id}`);
}

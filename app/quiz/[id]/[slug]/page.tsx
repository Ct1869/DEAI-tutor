import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import QuizClient from '../QuizClient';

// /quiz/[book_code]/[slug] — the speaking-URL route.
// The `id` param holds the book_code here (Next.js requires the same dynamic name across siblings).
export default async function QuizBySlugPage({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: bookCode, slug } = await params;
  const row = getDb().prepare('SELECT id FROM quizzes WHERE book_code = ? AND slug = ?').get(bookCode, slug) as { id: number } | undefined;
  if (!row) notFound();
  return <QuizClient id={String(row.id)} />;
}

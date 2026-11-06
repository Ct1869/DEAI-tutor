import { permanentRedirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import QuizClient from './QuizClient';

export default async function QuizByIdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const numId = Number(id);
  if (Number.isInteger(numId)) {
    const row = getDb().prepare('SELECT slug, book_code FROM quizzes WHERE id = ?').get(numId) as { slug: string | null; book_code: string | null } | undefined;
    if (row?.slug && row.book_code) {
      const review = typeof query.review === 'string' ? `?review=${encodeURIComponent(query.review)}` : '';
      permanentRedirect(`/quiz/${row.book_code}/${row.slug}${review}`);
    }
  }
  return <QuizClient id={id} />;
}

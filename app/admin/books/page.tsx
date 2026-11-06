import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import BookIngestionClient from './BookIngestionClient';

export const dynamic = 'force-dynamic';

export default async function BookIngestionPage() {
  if (!(await getSessionUser())) redirect('/login');
  const books = getDb().prepare(`SELECT id, name, code, archived_at FROM books ORDER BY archived_at IS NULL DESC, id DESC`).all() as Array<{
    id: number;
    name: string;
    code: string | null;
    archived_at: number | null;
  }>;
  return <BookIngestionClient books={books} />;
}

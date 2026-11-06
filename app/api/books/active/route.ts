import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

// GET /api/books/active — returns the single active book + its progress,
// so a trusted quiz publisher can do the whole day's work from one call.
export async function GET(req: Request) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getDb();
  const book = db.prepare(`SELECT * FROM books WHERE archived_at IS NULL ORDER BY id DESC LIMIT 1`).get() as any;
  if (!book) return NextResponse.json({ book: null, progress: null });
  const progress = db.prepare(`SELECT * FROM book_progress WHERE book_id = ?`).get(book.id);
  return NextResponse.json({ book, progress });
}

import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb, today } from '@/lib/db';

// GET /api/books/:id/progress — read cursor.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = getDb().prepare(`SELECT * FROM book_progress WHERE book_id = ?`).get(Number(id));
  return NextResponse.json({ progress: row || null });
}

// POST /api/books/:id/progress — advance cursor after a quiz drip.
// Body: { last_pdf_page?, last_printed_page?, last_quiz_id?, notes? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const bookId = Number(id);
  const b = await req.json();
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM book_progress WHERE book_id = ?`).get(bookId);
  if (!exists) {
    db.prepare(`INSERT INTO book_progress(book_id, updated_at) VALUES(?, ?)`).run(bookId, Date.now());
  }
  const sets: string[] = []; const vals: any[] = [];
  if ('last_pdf_page' in b) { sets.push('last_pdf_page = ?'); vals.push(b.last_pdf_page); }
  if ('last_printed_page' in b) { sets.push('last_printed_page = ?'); vals.push(b.last_printed_page); }
  if ('last_quiz_id' in b) { sets.push('last_quiz_id = ?'); vals.push(b.last_quiz_id); }
  if ('notes' in b) { sets.push('notes = ?'); vals.push(b.notes); }
  sets.push('last_quiz_date = ?'); vals.push(b.last_quiz_date || today());
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(bookId);
  db.prepare(`UPDATE book_progress SET ${sets.join(', ')} WHERE book_id = ?`).run(...vals);
  const progress = db.prepare(`SELECT * FROM book_progress WHERE book_id = ?`).get(bookId);
  return NextResponse.json({ ok: true, progress });
}

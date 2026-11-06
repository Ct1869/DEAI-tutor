import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

// GET /api/books/:id — read one book + progress.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const book = db.prepare(`SELECT * FROM books WHERE id = ?`).get(Number(id));
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const progress = db.prepare(`SELECT * FROM book_progress WHERE book_id = ?`).get(Number(id));
  return NextResponse.json({ book, progress });
}

// PATCH /api/books/:id — update book metadata (offset, pages_per_day, archive, etc.).
// Body: any subset of { name, drive_file_id, drive_url, answer_key_file_id, answer_key_url,
//                       page_offset, total_pdf_pages, printed_page_start, printed_page_end,
//                       pages_per_day, notes, archived }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  const allowed = ['name','drive_file_id','drive_url','answer_key_file_id','answer_key_url',
                   'page_offset','total_pdf_pages','printed_page_start','printed_page_end',
                   'pages_per_day','notes','code'] as const;
  const sets: string[] = []; const vals: any[] = [];
  const db = getDb();
  if ('code' in b) {
    const code = typeof b.code === 'string' && b.code.trim() ? b.code.trim() : null;
    if (code) {
      const existing = db.prepare(`SELECT id FROM books WHERE code = ? AND id != ?`).get(code, Number(id));
      if (existing) return NextResponse.json({ error: 'code already in use' }, { status: 409 });
    }
    b.code = code;
  }
  for (const k of allowed) if (k in b) { sets.push(`${k} = ?`); vals.push(b[k]); }
  if ('archived' in b) { sets.push(`archived_at = ?`); vals.push(b.archived ? Date.now() : null); }
  if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  vals.push(Number(id));
  db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if ('code' in b && typeof b.code === 'string') {
    db.prepare(`UPDATE quizzes SET book_code = ? WHERE book_id = ?`).run(b.code, Number(id));
  } else if ('code' in b && b.code === null) {
    db.prepare(`UPDATE quizzes SET book_code = NULL WHERE book_id = ?`).run(Number(id));
  }
  return NextResponse.json({ ok: true });
}

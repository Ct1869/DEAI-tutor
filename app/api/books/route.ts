import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

// POST /api/books — register a new book.
// Body: { name, drive_file_id?, drive_url?, answer_key_file_id?, answer_key_url?,
//         page_offset?, total_pdf_pages?, printed_page_start?, printed_page_end?,
//         pages_per_day?, notes?, set_active?: boolean }
export async function POST(req: Request) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json();
  if (!b?.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const db = getDb();
  const code = typeof b.code === 'string' && b.code.trim() ? b.code.trim() : null;
  if (code) {
    const existing = db.prepare(`SELECT id FROM books WHERE code = ?`).get(code);
    if (existing) return NextResponse.json({ error: 'code already in use' }, { status: 409 });
  }
  const info = db.prepare(`INSERT INTO books(
    name, drive_file_id, drive_url, answer_key_file_id, answer_key_url,
    page_offset, total_pdf_pages, printed_page_start, printed_page_end,
    pages_per_day, notes, code, created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name,
    b.drive_file_id || null,
    b.drive_url || null,
    b.answer_key_file_id || null,
    b.answer_key_url || null,
    b.page_offset ?? null,
    b.total_pdf_pages ?? null,
    b.printed_page_start ?? null,
    b.printed_page_end ?? null,
    b.pages_per_day ?? 4,
    b.notes || null,
    code,
    Date.now(),
  );
  const id = info.lastInsertRowid as number;
  db.prepare(`INSERT INTO book_progress(book_id, updated_at) VALUES(?, ?)`).run(id, Date.now());
  if (b.set_active) {
    db.prepare(`UPDATE books SET archived_at = ? WHERE id != ? AND archived_at IS NULL`).run(Date.now(), id);
  }
  return NextResponse.json({ ok: true, id });
}

// GET /api/books — list all books (active first).
export async function GET(req: Request) {
  const user = await getSessionUser();
  const apiOk = checkApiKey(req);
  if (!user && !apiOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getDb();
  const books = db.prepare(`SELECT * FROM books ORDER BY archived_at IS NULL DESC, id DESC`).all();
  return NextResponse.json({ books });
}

import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { saveBookPdf, type SourceKind } from '@/lib/book-ingestion';

async function authorized(req: Request) {
  return Boolean(await getSessionUser()) || checkApiKey(req);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId < 1) return NextResponse.json({ error: 'invalid book id' }, { status: 400 });

  try {
    const form = await req.formData();
    const imported: any[] = [];
    for (const [field, kind] of [['book', 'book'], ['answers', 'answers']] as Array<[string, SourceKind]>) {
      const file = form.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > 250 * 1024 * 1024) return NextResponse.json({ error: `${field} exceeds 250 MB` }, { status: 413 });
      imported.push(await saveBookPdf(bookId, kind, Buffer.from(await file.arrayBuffer())));
    }
    if (!imported.length) return NextResponse.json({ error: 'attach a book PDF or answer-key PDF' }, { status: 400 });
    return NextResponse.json({ ok: true, imported });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'PDF upload failed' }, { status: 422 });
  }
}

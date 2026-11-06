import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { analyzeBookSections, generateQuizDraft, importBookDriveSources, ingestionOverview } from '@/lib/book-ingestion';

async function authorized(req: Request) {
  return Boolean(await getSessionUser()) || checkApiKey(req);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(ingestionOverview(Number(id)));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load ingestion status' }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const bookId = Number(id);
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }); }

  try {
    if (body.action === 'import_drive') return NextResponse.json({ ok: true, imported: await importBookDriveSources(bookId) });
    if (body.action === 'analyze') return NextResponse.json({ ok: true, ...(await analyzeBookSections(bookId)) });
    if (body.action === 'generate') {
      const sectionId = body.section_id == null ? undefined : Number(body.section_id);
      return NextResponse.json({ ok: true, draft: await generateQuizDraft(bookId, sectionId) });
    }
    return NextResponse.json({ error: 'action must be import_drive, analyze, or generate' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Ingestion action failed' }, { status: 422 });
  }
}

import { NextResponse } from 'next/server';
import { checkApiKey, getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function authorized(req: Request) {
  return Boolean(await getSessionUser()) || checkApiKey(req);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }); }
  if (body.action !== 'reject') return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
  const info = getDb().prepare(`UPDATE quiz_drafts SET status = 'rejected', updated_at = ? WHERE id = ? AND status IN ('draft','invalid')`).run(Date.now(), Number(id));
  if (!info.changes) return NextResponse.json({ error: 'draft not found or no longer editable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

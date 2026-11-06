import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const SLUG = process.env.INSTRUCTION_SLUG;
const PASSWORD = process.env.INSTRUCTION_PASSWORD;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const key = url.searchParams.get('k');
  if (!SLUG || !PASSWORD || slug !== SLUG || key !== PASSWORD) {
    return new NextResponse('404 page not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const md = await readFile(path.join(process.cwd(), 'CLAUDE_PROJECT_INSTRUCTION.md'), 'utf8');
  return new NextResponse(md, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

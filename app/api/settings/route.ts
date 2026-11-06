import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { activeModel, getOAuthStatus, PROVIDER } from '@/lib/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    provider: PROVIDER,
    model: activeModel(),
    oauth: await getOAuthStatus(),
  });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'official SIWC integration is not installed' }, { status: 503 });
}

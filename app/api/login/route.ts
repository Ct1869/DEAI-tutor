import { NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (username === process.env.AUTH_USER && password === process.env.AUTH_PASS) {
    await setSessionCookie(username);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'invalid' }, { status: 401 });
}

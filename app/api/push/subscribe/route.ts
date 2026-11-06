import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sub = await req.json();
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  getDb().prepare(
    'INSERT INTO push_subscriptions(endpoint, p256dh, auth, created_at) VALUES(?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth'
  ).run(endpoint, p256dh, auth, Date.now());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { endpoint } = await req.json();
  if (endpoint) getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  return NextResponse.json({ ok: true });
}

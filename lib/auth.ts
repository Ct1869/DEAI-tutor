import { cookies } from 'next/headers';

const COOKIE_NAME = 'qa_session';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be configured in production.');
  return 'dev-secret-change-me';
}

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

export async function createToken(user: string): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${user}.${exp}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  const expected = await sign(`${user}.${exp}`);
  if (expected !== sig) return null;
  if (parseInt(exp, 10) < Date.now()) return null;
  return user;
}

export async function setSessionCookie(user: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, await createToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<string | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE_NAME)?.value);
}

export function checkApiKey(req: Request): boolean {
  const provided = req.headers.get('x-api-key') || '';
  const expected = process.env.QUIZ_API_KEY || '';
  if (!expected) return false;
  return provided === expected;
}

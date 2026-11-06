import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC = ['/login', '/api/login', '/api/quiz', '/api/vocab', '/api/logout', '/instruction'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();
  if (pathname === '/manifest.json' || pathname === '/sw.js' || /\.(png|ico|svg|webmanifest|txt)$/.test(pathname)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next(); // APIs handle their own auth
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  const token = req.cookies.get('qa_session')?.value;
  if (!(await verifyToken(token))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };

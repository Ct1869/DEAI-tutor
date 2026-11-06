import './globals.css';
import { getSessionUser } from '@/lib/auth';
import Link from 'next/link';
import PwaClient from './pwa-client';
import PerfTracker from './perf-tracker';
import ThemeToggle from './theme-toggle';
import { Fredoka, Nunito, JetBrains_Mono } from 'next/font/google';

const display = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const body = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Schreibheft — Deutsch',
  description: 'Lerne Deutsch — täglich, mit XP.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default' as const, title: 'Deutsch' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192' }, { url: '/icon-512.png', sizes: '512x512' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#080d19',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="de" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
      </head>
      <body>
        {user && (
          <>
            <header className="topbar">
              <Link href="/" className="brand" aria-label="Home">
                <span className="bolt">D</span>
                <span>Schreibheft</span>
              </Link>
              <nav className="topnav">
                <Link href="/">Heute</Link>
                <Link href="/tutor">Tutor Pilot</Link>
                <Link href="/review">Memory Lab</Link>
                <Link href="/practice">Sätze</Link>
                <Link href="/vocab">Wörter</Link>
                <Link href="/writing">Schreiben</Link>
                <Link href="/grammar">Grammatik</Link>
              </nav>
              <div className="topright">
                <ThemeToggle />
                <PwaClient />
                <Link href="/admin/settings" className="pillbtn" aria-label="Einstellungen" title="Einstellungen">⌘</Link>
                <form action="/api/logout" method="post" style={{ display: 'inline-flex' }}>
                  <button type="submit" className="pillbtn" aria-label="Abmelden" title="Abmelden">↗</button>
                </form>
              </div>
            </header>
          </>
        )}
        {user && <PerfTracker />}
        {children}
        {user && (
          <nav className="mobnav" aria-label="Bottom navigation">
            <ul>
              <li><Link href="/"><span className="g">⌂</span>Heute</Link></li>
              <li><Link href="/review"><span className="g">↻</span>Review</Link></li>
              <li><Link href="/practice"><span className="g">◫</span>Sätze</Link></li>
              <li><Link href="/vocab"><span className="g">◈</span>Wörter</Link></li>
              <li><Link href="/writing"><span className="g">✎</span>Schreiben</Link></li>
            </ul>
          </nav>
        )}
      </body>
    </html>
  );
}

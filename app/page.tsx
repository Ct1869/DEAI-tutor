import { getSessionUser } from '@/lib/auth';
import { getDb, today } from '@/lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function formatDate(d: Date) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const db = getDb();
  const t = today();
  const todays = db.prepare(`SELECT q.*, b.name AS book_name, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS n FROM quizzes q LEFT JOIN books b ON b.id = q.book_id WHERE scheduled_for = ? ORDER BY id DESC`).all(t) as any[];
  const recent = db.prepare(`SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS n FROM quizzes q WHERE scheduled_for IS NULL OR scheduled_for != ? ORDER BY id DESC LIMIT 8`).all(t) as any[];
  const now = Date.now();
  const dueVocab = (db.prepare('SELECT COUNT(*) AS c FROM vocab WHERE due_at <= ?').get(now) as any).c as number;
  const totalVocab = (db.prepare('SELECT COUNT(*) AS c FROM vocab').get() as any).c as number;
  const mastery = db.prepare(`SELECT COUNT(*) AS attempted,
    SUM(CASE WHEN due_at <= ? THEN 1 ELSE 0 END) AS due,
    SUM(CASE WHEN correct_streak >= 3 THEN 1 ELSE 0 END) AS mastered
    FROM question_mastery`).get(now) as any;
  const dueGrammar = Number(mastery?.due || 0);
  const today_obj = new Date();

  const firstOpen = todays.find((q: any) => !q.completed);
  const doneToday = todays.filter((q: any) => q.completed).length;
  const openToday = todays.length - doneToday;

  // The single "do this now" action — one clear next step, chosen by priority.
  const focus = { href: '/tutor', kicker: 'Geführter Pilot', title: 'Unit 1 · Verbposition', sub: 'Der Tutor wählt den nächsten Schritt und prüft deine Antwort.', cta: 'Sitzung beginnen' };

  return (
    <main className="container home">
      <header className="home-greet rise rise-1">
        <span className="home-date">{formatDate(today_obj).toUpperCase()}</span>
        <h1 className="home-hello">Leg los, <span className="em">Ahmed</span>.</h1>
      </header>

      {/* One focus card — the only thing shouting */}
      <Link href={focus.href} className="focus-card rise rise-1">
        <div className="focus-meta">
          <span className="focus-kicker">{focus.kicker}</span>
        </div>
        <div className="focus-title">{focus.title}</div>
        <div className="focus-sub">{focus.sub}</div>
        <span className="focus-cta">{focus.cta} →</span>
      </Link>

      {/* Quiet stat strip — progress, not points */}
      <div className="stat-strip rise rise-2">
        <div className="stat"><b>{dueVocab}</b><small>Wörter fällig</small></div>
        <div className="stat"><b>{totalVocab}</b><small>Wörter gesamt</small></div>
        <div className="stat"><b>{dueGrammar}</b><small>Reviews fällig</small></div>
        <div className="stat"><b>{doneToday}/{todays.length || 0}</b><small>Heute</small></div>
      </div>

      {/* Secondary destinations — equal weight, calm */}
      <nav className="home-grid rise rise-2" aria-label="Bereiche">
        <Link href="/practice" className="home-tile">
          <span className="ht-icon">◫</span>
          <b>Lesen</b>
          <small>Sätze &amp; Wörter tippen</small>
        </Link>
        <Link href="/vocab" className="home-tile">
          <span className="ht-icon">◈</span>
          <b>Wörter</b>
          <small>{dueVocab > 0 ? `${dueVocab} fällig` : 'alles wiederholt'}</small>
        </Link>
        <Link href="/writing" className="home-tile">
          <span className="ht-icon">✎</span>
          <b>Schreiben</b>
          <small>frei schreiben</small>
        </Link>
        <Link href="/review" className="home-tile">
          <span className="ht-icon">↻</span>
          <b>Review</b>
          <small>{dueGrammar > 0 ? `${dueGrammar} fällig` : 'nichts fällig'}</small>
        </Link>
      </nav>

      {/* Today's lessons — only if there are any, compact */}
      {todays.length > 0 && (
        <section className="home-section rise rise-3">
          <div className="home-section-head">
            <span>Heute</span>
            <span className="hsh-count">{doneToday}/{todays.length}</span>
          </div>
          <div className="tidy-list">
            {todays.map((q: any) => (
              <Link key={q.id} href={`/quiz/${q.id}`} className={`tidy-row ${q.completed ? 'done' : ''}`}>
                <span className="tr-mark">{q.completed ? '✓' : '▸'}</span>
                <span className="tr-title">{q.lesson_number != null ? `Lektion ${q.lesson_number} · ` : ''}{q.title}</span>
                <span className="tr-meta">{q.n} Fragen</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Archive — tucked away, never shouting */}
      {recent.length > 0 && (
        <details className="home-archive rise rise-4">
          <summary>Archiv <span className="ha-count">{recent.length}</span></summary>
          <div className="tidy-list">
            {recent.map((q: any) => (
              <Link key={q.id} href={`/quiz/${q.id}`} className={`tidy-row ${q.completed ? 'done' : ''}`}>
                <span className="tr-mark">{q.completed ? '✓' : '▸'}</span>
                <span className="tr-title">{q.lesson_number != null ? `Lektion ${q.lesson_number} · ` : ''}{q.title}</span>
                <span className="tr-meta">{q.scheduled_for || '—'}</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}

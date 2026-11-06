import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { masteryPercent } from '@/lib/mastery';

export const dynamic = 'force-dynamic';

type ReviewRow = {
  id: number;
  title: string;
  slug: string | null;
  book_code: string | null;
  lesson_number: number | null;
  total: number;
  attempted: number;
  due: number;
  fragile: number;
  mastered: number;
};

function quizUrl(row: ReviewRow) {
  const base = row.slug && row.book_code ? `/quiz/${row.book_code}/${row.slug}` : `/quiz/${row.id}`;
  return `${base}?review=${row.due ? 'due' : 'weak'}`;
}

export default async function ReviewPage() {
  if (!(await getSessionUser())) redirect('/login');
  const now = Date.now();
  const db = getDb();
  const rows = db.prepare(`SELECT q.id, q.title, q.slug, q.book_code, q.lesson_number,
      COUNT(DISTINCT qu.id) AS total,
      COUNT(DISTINCT qm.question_id) AS attempted,
      COUNT(DISTINCT CASE WHEN qm.due_at <= ? THEN qm.question_id END) AS due,
      COUNT(DISTINCT CASE WHEN qm.correct_streak < 3 THEN qm.question_id END) AS fragile,
      COUNT(DISTINCT CASE WHEN qm.correct_streak >= 3 THEN qm.question_id END) AS mastered
    FROM quizzes q
    JOIN questions qu ON qu.quiz_id = q.id
    LEFT JOIN question_mastery qm ON qm.question_id = qu.id
    GROUP BY q.id
    HAVING attempted > 0
    ORDER BY due DESC, fragile DESC, q.id DESC`).all(now) as ReviewRow[];
  const due = rows.reduce((sum, row) => sum + Number(row.due), 0);
  const mastered = rows.reduce((sum, row) => sum + Number(row.mastered), 0);
  const attempted = rows.reduce((sum, row) => sum + Number(row.attempted), 0);
  const pct = masteryPercent(mastered, attempted);

  return (
    <main className="container mastery-page">
      <section className="mastery-hero rise rise-1">
        <div>
          <div className="overline">Memory lab · aktives Erinnern</div>
          <h1 className="display">Wissen, das <span className="em">bleibt</span>.</h1>
          <p>Eine Lektion ist erst gelernt, wenn du sie später ohne Hilfe abrufen kannst. Hier landen fällige und unsichere Regeln automatisch.</p>
        </div>
        <div className="mastery-ring" style={{ '--mastery': `${pct * 3.6}deg` } as React.CSSProperties}>
          <strong>{pct}%</strong><span>stabil</span>
        </div>
      </section>

      <section className="metric-strip rise rise-2">
        <div><strong>{due}</strong><span>heute fällig</span></div>
        <div><strong>{attempted}</strong><span>gesehen</span></div>
        <div><strong>{mastered}</strong><span>3× erinnert</span></div>
      </section>

      <section className="rise rise-3" style={{ marginTop: 28 }}>
        <div className="section-label">Deine Wiederholungen</div>
        <div className="review-list">
          {rows.map((row) => {
            const rowPct = masteryPercent(row.mastered, row.attempted);
            return (
              <article className="review-card" key={row.id}>
                <div className="review-card-copy">
                  <span className="eyebrow">{row.lesson_number ? `Lektion ${row.lesson_number}` : 'Freies Quiz'}</span>
                  <h2>{row.title}</h2>
                  <div className="review-meter"><i style={{ width: `${rowPct}%` }} /></div>
                  <small>{row.mastered}/{row.attempted} stabil · {row.fragile} noch fragil</small>
                </div>
                <div className="review-card-action">
                  <span className={row.due ? 'due-now' : ''}>{row.due ? `${row.due} fällig` : 'später'}</span>
                  <Link className={`btn ${row.due ? 'primary' : ''}`} href={quizUrl(row)}>{row.due ? 'Abrufen' : 'Trainieren'}</Link>
                </div>
              </article>
            );
          })}
          {!rows.length && (
            <div className="empty mastery-empty"><div className="big">Noch kein Lernsignal</div><div className="sub">Löse dein erstes Buchquiz. Danach baut das System deinen persönlichen Wiederholungsplan.</div></div>
          )}
        </div>
      </section>
    </main>
  );
}

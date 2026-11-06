'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Book = { id: number; name: string; code: string | null; archived_at: number | null };
type Overview = {
  sources: Array<{ id: number; kind: 'book' | 'answers'; filename: string; checksum: string; page_count: number; updated_at: number }>;
  sections: Array<any>;
  drafts: Array<any>;
};

export default function BookIngestionClient({ books }: { books: Book[] }) {
  const active = books.find((book) => !book.archived_at) || books[0];
  const [bookId, setBookId] = useState(active?.id || 0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selectedBook = useMemo(() => books.find((book) => book.id === bookId), [books, bookId]);

  const load = useCallback(async () => {
    if (!bookId) return;
    const response = await fetch(`/api/books/${bookId}/ingestion`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Status konnte nicht geladen werden.');
    setOverview(data);
  }, [bookId]);

  useEffect(() => { load().catch((err) => setError(err.message)); }, [load]);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action + String(extra.section_id || ''));
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/books/${bookId}/ingestion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${action} fehlgeschlagen.`);
      if (action === 'import_drive') setNotice('Buch und Lösungsschlüssel wurden privat importiert.');
      if (action === 'analyze') setNotice(`${data.count} Lektionen erkannt${data.used_fallback ? ' (Seitenblöcke als sichere Reserve)' : ''}.`);
      if (action === 'generate') setNotice(data.draft?.validation?.ok ? 'Ein geprüfter Quiz-Entwurf ist bereit.' : 'Entwurf erstellt, aber die Validierung meldet Fehler.');
      await load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy('');
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('upload'); setError(''); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/books/${bookId}/sources`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload fehlgeschlagen.');
      setNotice('PDF-Dateien wurden privat gespeichert und extrahiert.');
      event.currentTarget.reset();
      await load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally { setBusy(''); }
  }

  async function draftAction(draftId: number, action: 'publish' | 'reject') {
    const key = `${action}-${draftId}`;
    setBusy(key); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/quiz-drafts/${draftId}${action === 'publish' ? '/publish' : ''}`, {
        method: action === 'publish' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ action: 'reject' }) : JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${action} fehlgeschlagen.`);
      setNotice(action === 'publish' ? `Quiz veröffentlicht: ${data.url}` : 'Entwurf verworfen.');
      await load();
    } catch (err: any) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  if (!books.length) return <main className="container"><h1 className="display">Keine Bücher</h1></main>;

  return (
    <main className="container ingestion-page">
      <div className="overline">Admin · Lernmaterial</div>
      <h1 className="display">Buch → Quiz</h1>
      <p className="lead">Das Buch bleibt privat. Erst extrahieren, dann in Lektionen teilen, Entwürfe prüfen und bewusst veröffentlichen.</p>

      <div className="ingestion-toolbar">
        <label>
          <span>Buch</span>
          <select value={bookId} onChange={(event) => setBookId(Number(event.target.value))}>
            {books.map((book) => <option key={book.id} value={book.id}>{book.archived_at ? 'Archiv · ' : ''}{book.name}</option>)}
          </select>
        </label>
        <Link className="btn" href="/admin/settings">Einstellungen</Link>
      </div>

      {notice && <div className="callout success">✓ {notice}</div>}
      {error && <div className="callout danger">{error}</div>}

      <section className="ingestion-step">
        <div className="step-number">1</div>
        <div className="step-body">
          <h2>Quellen importieren</h2>
          <p>Automatisch aus den gespeicherten Google-Drive-Links oder manuell als PDF. Maximal 250 MB pro Datei.</p>
          <div className="source-status">
            <span className={overview?.sources.some((source) => source.kind === 'book') ? 'ready' : ''}>Buch {overview?.sources.some((source) => source.kind === 'book') ? '✓' : '—'}</span>
            <span className={overview?.sources.some((source) => source.kind === 'answers') ? 'ready' : ''}>Lösungen {overview?.sources.some((source) => source.kind === 'answers') ? '✓' : '—'}</span>
          </div>
          <button className="btn primary" disabled={!!busy} onClick={() => run('import_drive')}>
            {busy === 'import_drive' ? 'Drive wird importiert…' : 'Drive-Dateien importieren'}
          </button>
          <details className="upload-details">
            <summary>Oder PDFs hochladen</summary>
            <form onSubmit={upload} className="upload-form">
              <label>Buch-PDF<input type="file" name="book" accept="application/pdf,.pdf" /></label>
              <label>Lösungs-PDF<input type="file" name="answers" accept="application/pdf,.pdf" /></label>
              <button className="btn" disabled={!!busy}>{busy === 'upload' ? 'Wird verarbeitet…' : 'Privat hochladen'}</button>
            </form>
          </details>
        </div>
      </section>

      <section className="ingestion-step">
        <div className="step-number">2</div>
        <div className="step-body">
          <h2>Lektionen erkennen</h2>
          <p>Die KI liest Inhaltsverzeichnis und Seitenmapping. Existierende veröffentlichte Lektionen bleiben erhalten.</p>
          <button className="btn blue" disabled={!!busy || !overview?.sources.some((source) => source.kind === 'book')} onClick={() => run('analyze')}>
            {busy === 'analyze' ? 'Buch wird analysiert…' : overview?.sections.length ? 'Lektionen neu analysieren' : 'Buch in Lektionen teilen'}
          </button>
          {overview?.sections.length ? <span className="mini-stat">{overview.sections.length} Lektionen</span> : null}
        </div>
      </section>

      <section className="ingestion-step">
        <div className="step-number">3</div>
        <div className="step-body">
          <h2>Quiz-Entwürfe</h2>
          <p>Jeder Entwurf nutzt nur seine Lektion und den passenden Lösungsausschnitt. Nichts wird automatisch veröffentlicht.</p>
          <button className="btn primary" disabled={!!busy || !overview?.sections.length} onClick={() => run('generate')}>
            {busy === 'generate' ? 'KI erstellt und prüft…' : 'Nächsten Entwurf erstellen'}
          </button>

          <div className="section-grid">
            {overview?.sections.slice(0, 120).map((section) => (
              <div className="section-row" key={section.id}>
                <div><strong>{section.lesson_number}. {section.title}</strong><small>S. {section.printed_page_start}–{section.printed_page_end}</small></div>
                <span className={`status ${section.quiz_id ? 'published' : section.draft_status || ''}`}>
                  {section.quiz_id ? 'veröffentlicht' : section.draft_status || 'bereit'}
                </span>
                {!section.quiz_id && !['draft', 'published'].includes(section.draft_status) && (
                  <button className="btn compact" disabled={!!busy} onClick={() => run('generate', { section_id: section.id })}>
                    {busy === `generate${section.id}` ? '…' : 'Entwurf'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <div className="section-label">Prüfen & veröffentlichen</div>
        <div className="draft-list">
          {overview?.drafts.map((draft) => (
            <article className="draft-card" key={draft.id}>
              <div className="draft-head">
                <div><span className="eyebrow">Lektion {draft.lesson_number} · Entwurf #{draft.id}</span><h3>{draft.title}</h3></div>
                <span className={`status ${draft.status}`}>{draft.status}</span>
              </div>
              <div className="draft-meta">{draft.payload.questions?.length || 0} Fragen · {draft.model || 'AI'} · {draft.prompt_version}</div>
              {!draft.validation.ok && (
                <ul className="validation-errors">{draft.validation.errors.map((issue: any, index: number) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul>
              )}
              <details>
                <summary>Fragen ansehen</summary>
                <ol className="draft-questions">{draft.payload.questions?.map((question: any, index: number) => <li key={index}><strong>{question.type}</strong> {question.prompt}<small>{question.source_ref}</small></li>)}</ol>
              </details>
              {draft.status === 'draft' && (
                <div className="draft-actions">
                  <button className="btn primary" disabled={!!busy} onClick={() => draftAction(draft.id, 'publish')}>{busy === `publish-${draft.id}` ? 'Wird veröffentlicht…' : 'Prüfung bestanden · veröffentlichen'}</button>
                  <button className="btn" disabled={!!busy} onClick={() => draftAction(draft.id, 'reject')}>Verwerfen</button>
                </div>
              )}
              {draft.status === 'published' && draft.published_quiz_id && <Link className="btn compact" href={`/quiz/${draft.published_quiz_id}`}>Quiz öffnen</Link>}
            </article>
          ))}
          {overview && !overview.drafts.length && <div className="empty"><div className="big">Noch keine Entwürfe</div><div className="sub">Importiere und analysiere zuerst das Buch.</div></div>}
        </div>
      </section>
    </main>
  );
}

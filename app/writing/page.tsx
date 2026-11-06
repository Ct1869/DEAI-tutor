'use client';
import { useEffect, useRef, useState } from 'react';
import { ClickableText } from '@/app/components/ClickableText';

const UMLAUTS = ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
type Level = typeof LEVELS[number];

type Topic = { topic: string; instruction: string; en: string | null; words: string[]; level: string };
type Feedback = {
  natural: string | null;
  feedback: string | null;
  corrections: Array<{ wrong: string; right: string; why: string }>;
  used_words: string[];
  score: number;
  auto_added_words?: Array<{ word: string; translation: string; article?: string }>;
};

const SCORE_LABEL: Record<number, string> = { 1: 'Weiter üben', 2: 'Fast', 3: 'Gut', 4: 'Stark', 5: 'Ausgezeichnet' };

function TermLoader({ label }: { label: string }) {
  return (
    <div className="term-loader" role="status" aria-live="polite">
      <div className="term-loader-line">
        <span className="term-prompt">$</span>
        <span className="term-label">{label}<span className="term-cursor">_</span></span>
      </div>
      <div className="term-sweep"><i /></div>
    </div>
  );
}

export default function WritingPage() {
  const [level, setLevel] = useState<Level>('B1');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(true);
  const [input, setInput] = useState('');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function loadTopic(lvl: Level = level) {
    setLoadingTopic(true);
    setError(null);
    setResult(null);
    setInput('');
    try {
      const r = await fetch('/api/writing/topic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: lvl }),
      });
      const d = await r.json();
      if (!r.ok || !d.topic) throw new Error(d.detail || d.error || 'Kein Thema erhalten');
      setTopic(d);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoadingTopic(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  useEffect(() => { loadTopic('B1'); /* eslint-disable-next-line */ }, []);

  async function submit() {
    if (!input.trim() || grading) return;
    setGrading(true);
    setError(null);
    try {
      const r = await fetch('/api/writing/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic?.topic, text: input.trim(), words: topic?.words || [] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || 'Bewertung fehlgeschlagen');
      setResult(d);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setGrading(false);
    }
  }

  function insertChar(c: string) {
    const el = inputRef.current;
    if (!el) { setInput((v) => v + c); return; }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    setInput(input.slice(0, start) + c + input.slice(end));
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + c.length; el.focus(); }, 0);
  }

  function changeLevel(lvl: Level) {
    setLevel(lvl);
    loadTopic(lvl);
  }

  return (
    <main className="container writing-page">
      <div className="overline">// Schreiben · frei</div>
      <h1 className="display" style={{ marginBottom: 14 }}>Schreib <span className="em">auf Deutsch</span>.</h1>

      <div className="write-levels">
        {LEVELS.map((l) => (
          <button key={l} className={`chip ${level === l ? 'on' : ''}`} onClick={() => changeLevel(l)} disabled={loadingTopic || grading}>{l}</button>
        ))}
      </div>

      {loadingTopic ? (
        <TermLoader label="thema wird gewählt" />
      ) : error && !topic ? (
        <div className="panel" style={{ padding: 18, marginTop: 16 }}>
          <p className="muted" style={{ marginBottom: 12 }}>⚠️ {error}</p>
          <button className="btn primary" onClick={() => loadTopic()}>Nochmal</button>
        </div>
      ) : topic ? (
        <>
          <section className="write-prompt panel">
            <div className="wp-kicker">// Thema</div>
            <div className="wp-topic">{topic.topic}</div>
            <div className="wp-instruction">{topic.instruction}</div>
            {topic.en && <div className="wp-en">{topic.en}</div>}
            {topic.words.length > 0 && (
              <div className="wp-words">
                <span className="wp-words-label">Versuch diese Wörter:</span>
                {topic.words.map((w) => (
                  <span key={w} className={`wp-word ${result?.used_words?.some((u) => u.toLowerCase().includes(w.toLowerCase().replace(/^(der|die|das)\s+/, ''))) ? 'used' : ''}`}>{w}</span>
                ))}
              </div>
            )}
          </section>

          <section className="panel" style={{ marginTop: 14, padding: 16 }}>
            <div className="wp-kicker" style={{ marginBottom: 8 }}>// Dein Text</div>
            <textarea
              ref={inputRef}
              className="input"
              style={{ minHeight: 150, resize: 'vertical', lineHeight: 1.6 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
              placeholder="Schreib frei… ganze Sätze, keine Angst vor Fehlern."
              disabled={grading}
              autoFocus
            />
            <div className="umlauts" style={{ marginTop: 10 }}>
              {UMLAUTS.map((c) => <button key={c} type="button" onClick={() => insertChar(c)} disabled={grading}>{c}</button>)}
            </div>
            {error && topic && <p className="muted" style={{ color: 'var(--red)', marginTop: 10 }}>⚠️ {error}</p>}
          </section>

          {grading && <TermLoader label="dein text wird gelesen" />}

          {result && (
            <section className="write-result panel">
              <div className="wr-head">
                <span className="wr-score">{result.score}/5 · {SCORE_LABEL[result.score]}</span>
              </div>
              {result.natural && (
                <div className="wr-block">
                  <div className="wp-kicker">// Natürlich gesagt</div>
                  <div className="wr-natural"><ClickableText text={result.natural} example={result.natural} /></div>
                </div>
              )}
              {result.feedback && (
                <div className="wr-block">
                  <div className="wp-kicker">// Feedback</div>
                  <p className="wr-feedback">{result.feedback}</p>
                </div>
              )}
              {result.corrections.length > 0 && (
                <div className="wr-block">
                  <div className="wp-kicker">// Korrekturen</div>
                  <ul className="wr-corrections">
                    {result.corrections.map((c, i) => (
                      <li key={i}>
                        <span className="wr-wrong">{c.wrong}</span>
                        <span className="wr-arrow">→</span>
                        <span className="wr-right">{c.right}</span>
                        {c.why && <span className="wr-why">{c.why}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!result.auto_added_words?.length && (
                <div className="wr-block">
                  <div className="wp-kicker">// Zum Wortschatz hinzugefügt</div>
                  <ul className="wr-corrections">
                    {result.auto_added_words.map((w, i) => (
                      <li key={i}>
                        <span className="wr-right">{w.article ? `${w.article} ${w.word}` : w.word}</span>
                        <span className="wr-arrow">→</span>
                        <span className="wr-why">{w.translation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <div className="action-bar" style={{ display: 'flex', gap: 8 }}>
            {!result ? (
              <button className="btn primary lg" style={{ flex: 1 }} onClick={submit} disabled={!input.trim() || grading}>
                {grading ? 'Wird gelesen…' : 'Abgeben · ⌘↩'}
              </button>
            ) : (
              <button className="btn primary lg" style={{ flex: 1 }} onClick={() => loadTopic()}>Neues Thema →</button>
            )}
            <button className="btn lg" onClick={() => loadTopic()} disabled={loadingTopic || grading} title="Anderes Thema">↻</button>
          </div>
        </>
      ) : null}
    </main>
  );
}

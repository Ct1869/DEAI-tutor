'use client';
import { useEffect, useState } from 'react';
import { displayVocabWord, normalizeVocabWord } from '@/lib/vocab-word';
import { ClickableText } from '@/app/components/ClickableText';

type V = {
  id: number;
  word: string;
  translation: string | null;
  article: string | null;
  example: string | null;
  examples: string | null;
  family: string | null;
  notes: string | null;
  due_at: number;
  interval_days: number;
  repetitions: number;
};

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

const FAMILY_COLORS: Record<string, string> = {
  noun: 'var(--gold-d)',
  verb: 'var(--green-d)',
  adj: 'var(--blue-d)',
  related: 'var(--purple-d)',
};

function parseFamily(v: V): Array<{ word: string; translation: string; type: string }> {
  if (!v.family) return [];
  try { return JSON.parse(v.family); } catch { return []; }
}

function parseExamples(v: V): string[] {
  const arr: string[] = [];
  if (v.examples) {
    try {
      const parsed = JSON.parse(v.examples);
      if (Array.isArray(parsed)) arr.push(...parsed);
    } catch {}
  }
  if (v.example && !arr.includes(v.example)) arr.push(v.example);
  return arr.slice(0, 3);
}

export default function VocabPage() {
  const [all, setAll] = useState<V[]>([]);
  const [due, setDue] = useState<V[]>([]);
  const [mode, setMode] = useState<'overview' | 'review'>('overview');
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStats, setSessionStats] = useState({ good: 0, miss: 0 });
  const [deleting, setDeleting] = useState<number | null>(null);

  async function load() {
    const a = await fetch('/api/vocab').then((r) => r.json());
    const d = await fetch('/api/vocab?due=1').then((r) => r.json());
    setAll(a.vocab || []);
    setDue(d.vocab || []);
  }
  useEffect(() => { load(); }, []);

  async function grade(quality: number) {
    const card = due[idx];
    if (!card) return;
    if (navigator.vibrate) navigator.vibrate(quality === 0 ? [40, 30, 40] : 20);
    setSessionStats((s) => quality === 0 ? { ...s, miss: s.miss + 1 } : { ...s, good: s.good + 1 });
    await fetch('/api/vocab/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: card.id, quality }),
    });
    setRevealed(false);
    if (idx + 1 >= due.length) { setSessionDone(true); load(); }
    else setIdx(idx + 1);
  }

  async function deleteWord(id: number) {
    setDeleting(id);
    await fetch(`/api/vocab/${id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  }

  if (mode === 'review' && !sessionDone) {
    const card = due[idx];
    if (!card) {
      return (
        <main className="container">
          <div className="panel" style={{ textAlign: 'center', padding: 36 }}>
            <div className="overline">Alles durch</div>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 34, margin: '10px 0 20px', textTransform: 'uppercase' }}>Fertig!</h2>
            <button className="btn primary" onClick={() => setMode('overview')}>Zurück</button>
          </div>
        </main>
      );
    }
    const pct = Math.round(((idx) / due.length) * 100);
    const examples = parseExamples(card);
    const family = parseFamily(card);
    return (
      <main className="container">
        <div className="quiz-hud rise rise-1">
          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, color: 'var(--green-d)', fontSize: 14 }}>Wiederholung</span>
          <div className="xpbar" style={{ justifySelf: 'center', maxWidth: 160 }}>
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="quiz-frac"><span className="cur">{idx + 1}</span><span style={{ color: 'var(--text-mute)' }}> / </span>{due.length}</div>
        </div>

        <div className="vocab-card rise rise-2" style={{ position: 'relative' }}>
          <button
            className="btn icon"
            style={{ position: 'absolute', top: 14, right: 14, minWidth: 44, minHeight: 44 }}
            onClick={() => speak(displayVocabWord(card.word, card.article))}
            aria-label="Hören"
          >🔊</button>
          {normalizeVocabWord(card.word, card.article).article && (
            <span className="article">{normalizeVocabWord(card.word, card.article).article}</span>
          )}
          <div className="word">{normalizeVocabWord(card.word, card.article).word}</div>

          {revealed ? (
            <>
              <div className="xltn">{card.translation || '—'}</div>
              {examples.length > 0 && (
                <div style={{ marginTop: 12, textAlign: 'left', padding: '0 8px' }}>
                  {examples.map((ex, i) => (
                    <div key={i} className="example" style={{ marginTop: i > 0 ? 6 : 0 }}>
                      „<ClickableText text={ex} example={ex} />"{' '}
                      <button
                        type="button"
                        onClick={() => speak(ex)}
                        aria-label="Satz hören"
                        style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit' }}
                      >🔊</button>
                    </div>
                  ))}
                </div>
              )}
              {family.length > 0 && (
                <div style={{ marginTop: 14, padding: '10px 0' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 800, marginBottom: 8 }}>Wortfamilie</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {family.map((f, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--bg-alt)',
                          border: '2px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 13, cursor: 'pointer',
                        }}
                        onClick={() => speak(f.word)}
                        title={f.translation}
                      >
                        <span style={{ fontWeight: 700, color: FAMILY_COLORS[f.type] ?? 'var(--text)' }}>{f.word}</span>
                        <span style={{ color: 'var(--text-mute)', marginLeft: 4, fontSize: 11 }}>{f.translation}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {card.notes && <div className="example" style={{ color: 'var(--text-mute)', marginTop: 6 }}>{card.notes}</div>}
            </>
          ) : (
            <div style={{ marginTop: 24 }}>
              <button className="btn primary lg" onClick={() => setRevealed(true)}>Aufdecken</button>
            </div>
          )}
        </div>

        {revealed && (
          <div className="srs-row rise rise-3">
            <button className="btn miss" onClick={() => grade(0)}>
              <span className="top">Miss</span><span className="bot">nochmal</span>
            </button>
            <button className="btn hard" onClick={() => grade(3)}>
              <span className="top">Hard</span><span className="bot">+ kurz</span>
            </button>
            <button className="btn good" onClick={() => grade(4)}>
              <span className="top">Good</span><span className="bot">weiter</span>
            </button>
            <button className="btn easy" onClick={() => grade(5)}>
              <span className="top">Easy!</span><span className="bot">+ lang</span>
            </button>
          </div>
        )}
      </main>
    );
  }

  if (sessionDone) {
    const total = sessionStats.good + sessionStats.miss;
    const acc = total > 0 ? Math.round((sessionStats.good / total) * 100) : 0;
    const ribbon = acc === 100 ? 'FLAWLESS' : acc >= 80 ? 'HIGH SCORE' : 'CLEARED';
    return (
      <main className="container">
        <div className="rise rise-1 result-ribbon">{ribbon}</div>
        <h1 className="display rise rise-1">Gut <span className="em">gemacht!</span></h1>
        <div className="rise rise-2 result-grid" style={{ marginTop: 20 }}>
          <div className="result-stat acc">
            <div className="label">Accuracy</div>
            <div className="value">{acc}%</div>
          </div>
          <div className="result-stat xp">
            <div className="label">Good</div>
            <div className="value">{sessionStats.good}</div>
          </div>
          <div className="result-stat combo">
            <div className="label">Miss</div>
            <div className="value">{sessionStats.miss}</div>
          </div>
        </div>
        <p className="muted rise rise-3" style={{ marginTop: 10, fontSize: 14 }}>Morgen kommen ein paar davon wieder — so funktioniert SRS.</p>
        <button className="btn primary lg full rise rise-4" style={{ marginTop: 18 }} onClick={() => { setSessionDone(false); setSessionStats({ good: 0, miss: 0 }); setMode('overview'); }}>Zurück zur Liste</button>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="overline rise rise-1">Wortschatz</div>
      <h1 className="display rise rise-1">Deine <span className="em">Wörter</span>.</h1>
      <p className="muted rise rise-2" style={{ marginTop: -6, marginBottom: 22, fontWeight: 500 }}>
        {all.length} Einträge · <span style={{ color: 'var(--hot-2)', fontWeight: 700 }}>{due.length} warten auf dich</span>
      </p>

      {due.length > 0 && (
        <section className="rise rise-2">
          <div className="section-label">Heute fällig</div>
          <div className="panel">
            <div className="big-tile">
              <div className="stack">
                <div>
                  <span className="big">{due.length}</span>
                  <span className="caption">Karten bereit</span>
                </div>
              </div>
              <button
                className="btn primary lg"
                onClick={() => { setIdx(0); setRevealed(false); setSessionStats({ good: 0, miss: 0 }); setMode('review'); }}
              >
                Üben starten
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="rise rise-3" style={{ marginTop: 28 }}>
        <div className="section-label">Sammlung</div>
        <div className="panel">
          {all.length === 0 && (
            <div className="empty">
              <div className="big">Noch keine Wörter</div>
              <div className="sub">Markier sie im Quiz mit ✎.</div>
            </div>
          )}
          {all.map((v) => {
            const days = Math.max(0, Math.round((v.due_at - Date.now()) / 86400000));
            const examples = parseExamples(v);
            const family = parseFamily(v);
            return (
              <div className="list-item" key={v.id} style={{ display: 'block', padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div className="w">
                      {normalizeVocabWord(v.word, v.article).article && (
                        <span className="art">{normalizeVocabWord(v.word, v.article).article}</span>
                      )}
                      {normalizeVocabWord(v.word, v.article).word}
                    </div>
                    <div className="m">{v.translation || '—'} · in {days}T · ×{v.repetitions}</div>
                  </div>
                  <button
                    className="btn ghost icon"
                    onClick={() => speak(displayVocabWord(v.word, v.article))}
                    aria-label="Hören"
                  >🔊</button>
                  <button
                    className="btn danger icon"
                    style={{ minWidth: 40, minHeight: 40, fontSize: 16, opacity: deleting === v.id ? 0.5 : 1 }}
                    onClick={() => deleteWord(v.id)}
                    disabled={deleting === v.id}
                    aria-label="Löschen"
                    title="Wort löschen"
                  >✕</button>
                </div>
                {(examples.length > 0 || family.length > 0) && (
                  <div style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                    {examples.map((ex, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic',
                          marginTop: i > 0 ? 4 : 0, lineHeight: 1.4,
                        }}
                      >
                        „<ClickableText text={ex} example={ex} />"{' '}
                        <button
                          type="button"
                          onClick={() => speak(ex)}
                          aria-label="Satz hören"
                          style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit' }}
                        >🔊</button>
                      </div>
                    ))}
                    {family.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: examples.length > 0 ? 8 : 0 }}>
                        {family.map((f, i) => (
                          <span
                            key={i}
                            style={{
                              padding: '2px 8px',
                              background: 'var(--bg-alt)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              fontSize: 11, cursor: 'pointer',
                            }}
                            onClick={() => speak(f.word)}
                            title={f.translation}
                          >
                            <span style={{ fontWeight: 700, color: FAMILY_COLORS[f.type] ?? 'var(--text)' }}>{f.word}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

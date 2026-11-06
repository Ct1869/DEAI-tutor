'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gradeStrict, normalize, type DiffChunk } from '@/lib/grader';
import { speakText } from '@/lib/speech';
import { ClickableText, markVocab } from '@/app/components/ClickableText';

type Q = {
  id: number;
  type: 'mcq' | 'fill_blank' | 'translation' | 'typing' | 'matching' | 'listening' | 'cloze';
  prompt: string;
  data: any;
  answer?: string | null;
  explanation?: string | null;
  audio_text?: string | null;
  mastery_repetitions?: number | null;
  mastery_streak?: number | null;
  mastery_due_at?: number | null;
  mastery_attempts?: number | null;
};

type ClozeGroup = { num: number; occurrences: number[] };

function clozeParts(prompt: string): Array<{ type: 'text'; value: string } | { type: 'blank'; num: number; occ: number }> {
  const out: Array<{ type: 'text'; value: string } | { type: 'blank'; num: number; occ: number }> = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let occ = 0;
  while ((m = re.exec(prompt)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: prompt.slice(last, m.index) });
    out.push({ type: 'blank', num: Number(m[1]), occ });
    occ++;
    last = m.index + m[0].length;
  }
  if (last < prompt.length) out.push({ type: 'text', value: prompt.slice(last) });
  return out;
}

function clozeGroups(prompt: string): ClozeGroup[] {
  const parts = clozeParts(prompt);
  const map = new Map<number, number[]>();
  for (const p of parts) {
    if (p.type === 'blank') {
      const list = map.get(p.num) || [];
      list.push(p.occ);
      map.set(p.num, list);
    }
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([num, occurrences]) => ({ num, occurrences }));
}

function parseAnswer(raw: any): any {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

function mcqChoices(q: Q): string[] {
  return q.data?.choices || q.data?.options || [];
}

function mcqCorrectIndex(q: Q): number {
  if (typeof q.data?.correct_index === 'number') return q.data.correct_index;
  const a = parseAnswer(q.answer);
  if (typeof a === 'number') return a;
  if (typeof a === 'string') {
    const n = Number(a);
    if (Number.isInteger(n)) return n;
    const choices = mcqChoices(q);
    const idx = choices.findIndex((c) => c === a);
    if (idx >= 0) return idx;
  }
  return -1;
}

function matchingPairs(q: Q): Record<string, string> {
  if (q.data?.pairs && typeof q.data.pairs === 'object') return q.data.pairs;
  const a = parseAnswer(q.answer);
  if (a && typeof a === 'object' && !Array.isArray(a)) return a;
  const left: string[] = q.data?.left || [];
  const right: string[] = q.data?.right || [];
  const out: Record<string, string> = {};
  left.forEach((l, i) => { out[l] = right[i] ?? ''; });
  return out;
}

function acceptedAnswers(q: Q): string[] {
  if (Array.isArray(q.data?.accepted_answers) && q.data.accepted_answers.length) return q.data.accepted_answers;
  const a = parseAnswer(q.answer);
  if (Array.isArray(a)) return a.map((x) => String(x));
  if (typeof a === 'string' && a.length) return [a];
  return [];
}

function speak(text: string, slow = false) { speakText(text, 'de-DE', slow ? 0.68 : 0.9); }

type CheckResult = { correct: boolean; answer?: string; explanation?: string | null; diff?: DiffChunk[]; message?: string };

const TYPE_LABELS: Record<Q['type'], string> = {
  mcq: 'Auswahl',
  fill_blank: 'Lücke',
  translation: 'Übersetzung',
  typing: 'Schreiben',
  matching: 'Zuordnung',
  listening: 'Hören',
  cloze: 'Lückentext',
};

export default function QuizClient({ id }: { id: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [checked, setChecked] = useState<Record<number, CheckResult>>({});
  const [finalResult, setFinalResult] = useState<any>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [restored, setRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mode = new URLSearchParams(window.location.search).get('review');
    setReviewMode(mode === 'due' || mode === 'weak');
    Promise.all([
      fetch(`/api/quiz/${id}`).then((r) => r.json()),
      fetch(`/api/quiz/${id}/progress`).then((r) => r.ok ? r.json() : { state: null }).catch(() => ({ state: null })),
    ]).then(([d, p]) => {
      if (cancelled) return;
      setQuiz(d.quiz);
      const allQuestions: Q[] = d.questions || [];
      const focused = mode === 'due'
        ? allQuestions.filter((question) => question.mastery_due_at != null && Number(question.mastery_due_at) <= Date.now())
        : mode === 'weak'
          ? allQuestions.filter((question) => Number(question.mastery_streak || 0) < 3)
          : allQuestions;
      setQuestions(focused.length ? focused : allQuestions);
      const s = p?.state;
      if (!mode && s && typeof s === 'object') {
        if (s.answers) setAnswers(s.answers);
        if (s.checked) setChecked(s.checked);
        if (typeof s.idx === 'number') setIdx(Math.min(s.idx, Math.max(0, (d.questions?.length || 1) - 1)));
      }
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!restored || finalResult) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/quiz/${id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { idx, answers, checked } }),
      }).catch(() => {});
    }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [restored, finalResult, id, idx, answers, checked]);

  const q = questions[idx];
  async function finalize() {
    const results = Object.entries(answers).map(([qid, ans]) => ({ question_id: Number(qid), user_answer: ans }));
    const r = await fetch(`/api/quiz/${id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results, review_mode: reviewMode }) });
    const d = await r.json();
    setFinalResult(d);
    fetch(`/api/quiz/${id}/progress`, { method: 'DELETE' }).catch(() => {});
  }

  function reinforceMistakes() {
    const weakIds = new Set<number>((finalResult?.details || []).filter((detail: any) => !detail.correct).map((detail: any) => Number(detail.question_id)));
    const weak = questions.filter((question) => weakIds.has(question.id));
    if (!weak.length) return;
    setQuestions(weak);
    setIdx(0);
    setAnswers({});
    setChecked({});
    setFinalResult(null);
    setReviewMode(true);
  }

  function recordAnswer(v: any) { setAnswers((a) => ({ ...a, [q.id]: v })); }

  function checkCurrent() {
    const a = answers[q.id];
    if (a === undefined || a === '' || (typeof a === 'object' && a !== null && Object.keys(a).length === 0)) return;
    const res = evaluate(q, a);
    setChecked((c) => ({ ...c, [q.id]: { ...res, explanation: q.explanation } }));
  }

  function next() {
    if (idx + 1 >= questions.length) finalize();
    else setIdx(idx + 1);
  }

  if (!quiz) {
    return (
      <main className="container">
        <div className="overline">Lade…</div>
        <p className="muted">Das Heft wird gestartet…</p>
      </main>
    );
  }

  if (finalResult) {
    const pct = finalResult.total > 0 ? Math.round((finalResult.correct / finalResult.total) * 100) : 0;
    const mistakeCount = (finalResult.details || []).filter((detail: any) => !detail.correct).length;
    return (
      <main className="container">
        <div className="overline">// Ergebnis</div>
        <h1 className="display" style={{ marginBottom: 18 }}>
          {finalResult.correct}<span style={{ color: 'var(--text-mute)' }}>/{finalResult.total}</span>
          <span style={{ color: 'var(--text-mute)', fontSize: '0.4em', marginLeft: 14 }}>{pct}%</span>
        </h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          {mistakeCount
            ? `${mistakeCount} Fehler — jetzt festigen, dann kommen sie mit Abstand im Review wieder.`
            : 'Alles richtig. Diese Fragen tauchen mit Abstand im Review wieder auf.'}
        </p>
        <div className="row" style={{ gap: 10 }}>
          {mistakeCount > 0 && <button className="btn primary lg full" onClick={reinforceMistakes}>Fehler festigen</button>}
          <button className={`btn lg full ${mistakeCount ? '' : 'primary'}`} onClick={() => router.push('/review')}>Zum Review</button>
          <button className="btn lg full" onClick={() => router.push('/')}>Fertig</button>
        </div>
      </main>
    );
  }

  if (!q) return <main className="container"><p className="muted">Keine Fragen.</p></main>;

  const isChecked = !!checked[q.id];
  const cr = checked[q.id];

  return (
    <main className="container quiz-wrap">
      {reviewMode && <div className="review-session-badge">↻ Review · Abrufen ohne Nachlesen</div>}

      {/* Quiz HUD — just position */}
      <div className="quiz-hud minimal">
        <div className="quiz-frac"><span className="cur">{idx + 1}</span><span style={{ color: 'var(--text-mute)' }}> / </span>{questions.length}</div>
      </div>

      <div className="prog-dots">
        {questions.map((_, i) => {
          const cq = questions[i];
          const cc = checked[cq?.id];
          const done = cc?.correct;
          const wrong = cc && !cc.correct;
          return (
            <span
              key={i}
              className={`dot ${done ? 'filled' : ''} ${wrong ? 'wrong' : ''} ${i === idx ? 'current' : ''}`}
            />
          );
        })}
      </div>

      <div key={q.id} className="rise rise-1" style={{ marginTop: 4 }}>
        <div className="q-kind">{q.data?.stage ? `${String(q.data.stage).toUpperCase()} · ` : ''}{TYPE_LABELS[q.type]} · Frage {idx + 1}</div>
        <div className="q-number">Q.{String(idx + 1).padStart(2, '0')}</div>
        <div className="q-prompt">
          {q.type === 'listening' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <button className="btn icon" onClick={() => speak(q.audio_text || q.prompt)} aria-label="Abspielen">▶</button>
              <button className="btn icon" onClick={() => speak(q.audio_text || q.prompt, true)} aria-label="Langsam abspielen">½</button>
              <span style={{ color: 'var(--text-dim)' }}>Schreib, was du hörst.</span>
            </span>
          ) : q.type === 'cloze' ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 15 }}>Setz die Wörter aus dem Kasten in die richtige Form ein.</span>
          ) : (
            <ClickableText text={q.prompt} example={q.prompt} />
          )}
        </div>

        <QuestionBody q={q} value={answers[q.id]} onChange={recordAnswer} disabled={isChecked} />

        {isChecked && (
          <div className={`feedback ${cr.correct ? 'ok' : 'bad'} rise rise-1`}>
            <div className="fb-heading">
              {cr.correct ? <>✓ Richtig</> : <>✗ Leider nicht</>}
            </div>
            {!cr.correct && cr.diff && (
              <div className="diff">
                {cr.diff.map((c, i) => renderChunk(c, i))}
              </div>
            )}
            {cr.message && <div className="fb-msg">{cr.message}</div>}
            {!cr.correct && cr.answer && (
              <div className="fb-note" style={{ marginTop: 8 }}>
                <span style={{ color: 'var(--text-mute)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Richtige Antwort · </span>
                <ClickableText text={cr.answer} example={cr.answer} />
              </div>
            )}
            {cr.explanation && (
              <div className="fb-note" style={{ marginTop: 6 }}>
                <ClickableText text={cr.explanation} example={cr.answer ?? q.prompt} />
              </div>
            )}
          </div>
        )}

      </div>

      <div className="action-bar">
        <button className="btn icon" onClick={() => {
          const w = prompt('Wort zum Wortschatz hinzufügen:');
          if (w) markVocab(w.trim());
        }} aria-label="Wort markieren" title="Wort markieren">✎</button>
        {isChecked ? (
          <button className="btn primary lg" onClick={next}>{idx + 1 >= questions.length ? 'Auswerten' : 'Weiter'}</button>
        ) : (
          <button className="btn primary lg" onClick={checkCurrent} disabled={answers[q.id] === undefined || answers[q.id] === ''}>Prüfen</button>
        )}
      </div>
    </main>
  );
}

function renderChunk(c: DiffChunk, i: number) {
  if (c.t === 'ok') return <span key={i} className="ok">{c.s}</span>;
  if (c.t === 'sub') {
    return <span key={i} className={`sub ${c.umlaut ? 'umlaut' : ''}`} title={`du: ${c.got}`}>{c.expected}</span>;
  }
  if (c.t === 'miss') {
    return <span key={i} className={`miss ${c.umlaut ? 'umlaut' : ''}`}>{c.expected}</span>;
  }
  return <span key={i} className="extra">{c.got}</span>;
}

function evaluate(q: Q, user: any): { correct: boolean; answer: string; diff?: DiffChunk[]; message?: string } {
  if (q.type === 'mcq') {
    const correctIdx = mcqCorrectIndex(q);
    const ok = correctIdx >= 0 && user === correctIdx;
    return { correct: ok, answer: mcqChoices(q)[correctIdx] ?? '' };
  }
  if (q.type === 'matching') {
    const pairs = matchingPairs(q);
    if (!user || typeof user !== 'object') return { correct: false, answer: JSON.stringify(pairs) };
    const ok = Object.keys(pairs).every((k) => normalize(String(pairs[k])) === normalize(String(user[k])));
    return { correct: ok, answer: JSON.stringify(pairs) };
  }
  if (q.type === 'cloze') {
    const answer = parseAnswer(q.answer);
    const expected: string[] = Array.isArray(answer) ? answer.map((x) => String(x)) : [];
    const inputs: Record<string, string> = (user && typeof user === 'object') ? user : {};
    const groups = clozeGroups(q.prompt || '');
    let ok = groups.length > 0;
    for (const g of groups) {
      const exp = normalize(expected[g.num - 1] ?? '');
      const got = normalize(g.occurrences.map((o) => inputs[String(o)] || '').join(' '));
      if (!exp || exp !== got) { ok = false; break; }
    }
    return { correct: ok, answer: expected.join(' / ') };
  }
  const accepts: string[] = acceptedAnswers(q);
  if (accepts.length === 0) return { correct: false, answer: '' };
  let best = gradeStrict(accepts[0], String(user ?? ''));
  for (let i = 1; i < accepts.length; i++) {
    const g = gradeStrict(accepts[i], String(user ?? ''));
    if (g.correct) { best = g; break; }
    if ((g.issues?.length ?? 999) < (best.issues?.length ?? 999)) best = g;
  }
  return { correct: best.correct, answer: accepts[0], diff: best.diff, message: best.message };
}

function QuestionBody({ q, value, onChange, disabled }: { q: Q; value: any; onChange: (v: any) => void; disabled: boolean }) {
  if (q.type === 'mcq') {
    const choices: string[] = mcqChoices(q);
    const correctIdx = mcqCorrectIndex(q);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    return (
      <div className="choices">
        {choices.map((c, i) => (
          <button
            key={i}
            className={`choice ${value === i ? 'selected' : ''} ${disabled && correctIdx === i ? 'correct' : ''} ${disabled && value === i && value !== correctIdx ? 'wrong' : ''}`}
            onClick={() => !disabled && onChange(i)}
            disabled={disabled}
          >
            <span className="kbd">{letters[i] || i + 1}</span>
            <span style={{ flex: 1 }}>{c}</span>
          </button>
        ))}
      </div>
    );
  }
  if (q.type === 'matching') {
    return <MatchingArrows q={q} value={value} onChange={onChange} disabled={disabled} />;
  }
  if (q.type === 'cloze') {
    return <ClozeBody q={q} value={value} onChange={onChange} disabled={disabled} />;
  }
  return <TextInputWithMic value={value || ''} onChange={onChange} disabled={disabled} />;
}

function ClozeBody({ q, value, onChange, disabled }: { q: Q; value: any; onChange: (v: any) => void; disabled: boolean }) {
  const parts = useMemo(() => clozeParts(q.prompt || ''), [q.id, q.prompt]);
  const groups = useMemo(() => clozeGroups(q.prompt || ''), [q.id, q.prompt]);
  const pool: string[] = q.data?.pool || [];
  const inputs: Record<string, string> = (value && typeof value === 'object') ? value : {};
  const expected: string[] = useMemo(() => {
    const a = parseAnswer(q.answer);
    return Array.isArray(a) ? a.map((x) => String(x)) : [];
  }, [q.id, q.answer]);

  const [popupIdx, setPopupIdx] = useState<number | null>(null);
  const [manualUsed, setManualUsed] = useState<Set<number>>(new Set());
  const [translation, setTranslation] = useState<string | null>(null);
  const [senses, setSenses] = useState<string[]>([]);
  const [transSource, setTransSource] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [vocabStatus, setVocabStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPopupIdx(null); setManualUsed(new Set()); }, [q.id]);

  useEffect(() => {
    if (popupIdx === null) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupIdx(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [popupIdx]);

  function openPopup(i: number) {
    setPopupIdx(i);
    setTranslation(null);
    setSenses([]);
    setTransSource(null);
    setVocabStatus('idle');
    // Auto-fire translation on open — feels instantaneous when cached
    doTranslate(pool[i]);
  }

  async function doTranslate(word: string) {
    setTranslating(true);
    try {
      const r = await fetch(`/api/vocab/lookup?word=${encodeURIComponent(word)}&quick=1`);
      const d = await r.json();
      setTranslation(d?.translation || '—');
      setSenses(Array.isArray(d?.senses) ? d.senses : []);
      setTransSource(d?.source || null);
    } catch {
      setTranslation('Fehler');
    } finally {
      setTranslating(false);
    }
  }

  function doMarkUsed(i: number) {
    setManualUsed((prev) => {
      const next = new Set(prev);
      if (next.has(i + 1)) next.delete(i + 1); else next.add(i + 1);
      return next;
    });
    setPopupIdx(null);
  }

  async function doAddVocab(word: string) {
    setVocabStatus('saving');
    try {
      const r = await fetch('/api/vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, source: 'cloze-pool' }),
      });
      setVocabStatus(r.ok ? 'saved' : 'error');
      if (r.ok) setTimeout(() => setPopupIdx(null), 700);
    } catch {
      setVocabStatus('error');
    }
  }

  function setOcc(occ: number, v: string) {
    onChange({ ...inputs, [String(occ)]: v });
  }

  // pool word at index i corresponds to blank number i+1
  const usedNums = new Set<number>(manualUsed);
  for (const g of groups) {
    const filled = g.occurrences.every((o) => (inputs[String(o)] || '').trim() !== '');
    if (filled) usedNums.add(g.num);
  }

  // per-blank correctness when disabled (after Prüfen)
  const groupCorrect: Record<number, boolean> = {};
  if (disabled) {
    for (const g of groups) {
      const exp = normalize(expected[g.num - 1] ?? '');
      const got = normalize(g.occurrences.map((o) => inputs[String(o)] || '').join(' '));
      groupCorrect[g.num] = !!exp && exp === got;
    }
  }

  return (
    <div className="cloze">
      {pool.length > 0 && (
        <div className="cloze-pool">
          {pool.map((w, i) => (
            <span key={i} className="cloze-pool-word-wrap">
              <button
                type="button"
                className={`cloze-pool-word ${usedNums.has(i + 1) ? 'used' : ''}`}
                onClick={() => openPopup(i)}
              >{w}</button>
              {popupIdx === i && (
                <div className="cloze-pool-popup" ref={popupRef}>
                  <div className="cloze-pool-popup-trans">
                    {translating && !translation ? (
                      <span className="cloze-pool-popup-loading">Übersetze…</span>
                    ) : translation ? (
                      <>
                        <div className="cloze-pool-popup-trans-main">
                          EN: <strong>{translation}</strong>
                          {transSource && <span className="cloze-pool-popup-src">{transSource === 'wiktionary' ? '📖' : '🌐'}</span>}
                        </div>
                        {senses.length > 1 && (
                          <ol className="cloze-pool-popup-senses">
                            {senses.slice(0, 5).map((s, k) => <li key={k}>{s}</li>)}
                          </ol>
                        )}
                      </>
                    ) : (
                      <button type="button" className="cloze-pool-popup-btn" onClick={() => doTranslate(w)}>
                        Übersetzen
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="cloze-pool-popup-btn"
                    onClick={() => doMarkUsed(i)}
                  >
                    {manualUsed.has(i + 1) ? 'Nicht verwendet' : 'Verwendet ✓'}
                  </button>
                  <button
                    type="button"
                    className="cloze-pool-popup-btn"
                    onClick={() => doAddVocab(w)}
                    disabled={vocabStatus === 'saving' || vocabStatus === 'saved'}
                  >
                    {vocabStatus === 'saving' ? '…' : vocabStatus === 'saved' ? 'Hinzugefügt ✓' : vocabStatus === 'error' ? 'Fehler' : 'Zur Vokabelliste ＋'}
                  </button>
                </div>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="cloze-passage">
        {parts.map((p, i) => {
          if (p.type === 'text') return <ClickableText key={i} text={p.value} example={q.prompt} />;
          const v = inputs[String(p.occ)] || '';
          const ok = disabled ? groupCorrect[p.num] : undefined;
          const cls = `cloze-input ${disabled && ok === true ? 'ok' : ''} ${disabled && ok === false ? 'bad' : ''}`;
          const width = Math.max(4, v.length + 1);
          return (
            <input
              key={i}
              className={cls}
              value={v}
              onChange={(e) => setOcc(p.occ, e.target.value)}
              disabled={disabled}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ width: `${width}ch` }}
              aria-label={`Lücke ${p.num}`}
            />
          );
        })}
      </div>
      {disabled && expected.length > 0 && (
        <div className="cloze-answers">
          {groups.map((g) => (
            <div key={g.num} className={`cloze-ans-row ${groupCorrect[g.num] ? 'ok' : 'bad'}`}>
              <span className="num">[{g.num}]</span>
              <span className="val"><ClickableText text={expected[g.num - 1] ?? ''} example={q.prompt} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchingArrows({ q, value, onChange, disabled }: { q: Q; value: any; onChange: (v: any) => void; disabled: boolean }) {
  const pairs = useMemo(() => matchingPairs(q), [q.id]);
  const lefts = useMemo(() => Object.keys(pairs), [pairs]);
  const rights = useMemo(() => shuffle(Object.values(pairs)), [q.id]);
  const current: Record<string, string> = (value && typeof value === 'object') ? value : {};
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); };
  }, []);

  // Re-tick after first paint so refs are populated
  useEffect(() => { setTick((t) => t + 1); }, [lefts, rights]);

  function leftConnected(L: string): boolean { return !!current[L]; }
  function rightConnectedBy(R: string): string | null {
    for (const k of Object.keys(current)) if (current[k] === R) return k;
    return null;
  }

  function tapLeft(L: string) {
    if (disabled) return;
    if (current[L]) {
      const { [L]: _drop, ...rest } = current;
      onChange(rest);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft((s) => (s === L ? null : L));
  }

  function tapRight(R: string) {
    if (disabled) return;
    const owner = rightConnectedBy(R);
    if (owner) {
      const { [owner]: _drop, ...rest } = current;
      onChange(rest);
      return;
    }
    if (!selectedLeft) return;
    const next: Record<string, string> = { ...current, [selectedLeft]: R };
    onChange(next);
    setSelectedLeft(null);
  }

  // compute line endpoints
  const container = containerRef.current;
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; ok?: boolean; key: string }> = [];
  if (container) {
    const cb = container.getBoundingClientRect();
    for (const L of lefts) {
      const R = current[L];
      if (!R) continue;
      const lEl = leftRefs.current[L];
      const rEl = rightRefs.current[R];
      if (!lEl || !rEl) continue;
      const lb = lEl.getBoundingClientRect();
      const rb = rEl.getBoundingClientRect();
      const x1 = lb.right - cb.left;
      const y1 = lb.top + lb.height / 2 - cb.top;
      const x2 = rb.left - cb.left;
      const y2 = rb.top + rb.height / 2 - cb.top;
      const ok = disabled ? normalize(String(pairs[L])) === normalize(String(R)) : undefined;
      lines.push({ x1, y1, x2, y2, ok, key: `${L}->${R}` });
    }
  }

  return (
    <div className="match-arrows" ref={containerRef}>
      <svg className="match-svg" aria-hidden>
        {lines.map((ln) => (
          <line
            key={ln.key}
            x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
            className={`match-line ${ln.ok === true ? 'ok' : ''} ${ln.ok === false ? 'bad' : ''}`}
          />
        ))}
      </svg>
      <div className="match-col left">
        {lefts.map((L) => {
          const connected = leftConnected(L);
          const sel = selectedLeft === L;
          const ok = disabled && connected ? normalize(String(pairs[L])) === normalize(String(current[L])) : undefined;
          return (
            <div
              key={L}
              ref={(el) => { leftRefs.current[L] = el; }}
              className={`match-item ${sel ? 'selected' : ''} ${connected ? 'connected' : ''} ${ok === true ? 'ok' : ''} ${ok === false ? 'bad' : ''}`}
              onClick={() => tapLeft(L)}
            >
              {L}
            </div>
          );
        })}
      </div>
      <div className="match-col right">
        {rights.map((R) => {
          const owner = rightConnectedBy(R);
          const connected = !!owner;
          const ok = disabled && owner ? normalize(String(pairs[owner])) === normalize(String(R)) : undefined;
          return (
            <div
              key={R}
              ref={(el) => { rightRefs.current[R] = el; }}
              className={`match-item ${connected ? 'connected' : ''} ${ok === true ? 'ok' : ''} ${ok === false ? 'bad' : ''}`}
              onClick={() => tapRight(R)}
            >
              {R}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextInputWithMic({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const Recog = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  // Recognition keeps the mic open until it is stopped; make sure navigating
  // away mid-question never leaves it running.
  useEffect(() => () => { try { recRef.current?.abort(); } catch {} }, []);

  const MIC_ERRORS: Record<string, string> = {
    'not-allowed': 'Mikrofon blockiert — bitte in den Browser-Einstellungen erlauben.',
    'service-not-allowed': 'Mikrofon blockiert — bitte in den Browser-Einstellungen erlauben.',
    'no-speech': 'Nichts gehört — bitte nochmal versuchen.',
    'audio-capture': 'Kein Mikrofon gefunden.',
    'network': 'Netzwerkfehler bei der Spracherkennung.',
    'aborted': '',
  };

  function toggleMic() {
    if (!Recog) { setErr('Spracherkennung in diesem Browser nicht verfügbar.'); return; }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setErr('Mikrofon braucht eine HTTPS-Verbindung.');
      return;
    }
    if (listening) { try { recRef.current?.stop(); } catch {} return; }

    const r = new Recog();
    recRef.current = r;
    r.lang = 'de-DE';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 3;
    r.onresult = (e: any) => {
      const best = e.results?.[0]?.[0]?.transcript;
      if (typeof best === 'string' && best.trim()) {
        onChange(best.replace(/[.,!?;:]\s*$/, '').trim());
      }
    };
    r.onerror = (e: any) => {
      const msg = MIC_ERRORS[e?.error] ?? `Fehler: ${e?.error ?? 'unbekannt'}`;
      if (msg) setErr(msg);
      setListening(false);
    };
    r.onend = () => { setListening(false); recRef.current = null; };
    setErr(null);
    setListening(true);
    try {
      r.start();
    } catch {
      // start() throws if a previous session is still winding down
      setListening(false);
      setErr('Mikrofon ist noch beschäftigt — kurz warten.');
    }
  }

  function insert(ch: string) {
    onChange((value || '') + ch);
  }

  return (
    <div>
      <div className="input-row">
        <input
          className="input"
          placeholder="Deine Antwort…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
        />
        <button type="button" className={`mic ${listening ? 'active' : ''}`} onClick={toggleMic} disabled={disabled} aria-label={listening ? 'Aufnahme stoppen' : 'Sprechen'}>
          {listening ? '●' : '🎙'}
        </button>
      </div>
      {!disabled && (
        <div className="umlauts">
          {['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map((c) => (
            <button type="button" key={c} onClick={() => insert(c)}>{c}</button>
          ))}
        </div>
      )}
      {err && <div className="muted" style={{ color: 'var(--danger-2)', marginTop: 8, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

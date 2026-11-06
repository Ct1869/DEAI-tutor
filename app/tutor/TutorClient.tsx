'use client';
import { useEffect, useState } from 'react';

type Activity = { id: string; phase: string; instruction: string; explanation?: string; responseMode: 'text' | 'speech'; source: { printedPage: number; exercise?: number; item?: number; status: string } };
type Session = { id: string; budgetMinutes: number; completed: string[]; queue: string[]; currentActivityId?: string };
type Report = { studied: string[]; attempted: number; independentlyCorrect: number; applicationCorrect: number; uncertain: number; needsWork: string[]; dueReviews: number; textbookCoverage: { verifiedPages: number; unitPages: number; totalBookPages: number }; practiceCompletion: { completed: number; assigned: number }; demonstratedMastery: { objectives: number; total: number }; retention: { passed: number; total: number }; next: string };

export default function TutorClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [budget, setBudget] = useState(30);
  const [answer, setAnswer] = useState('');
  const [assisted, setAssisted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limitedMode, setLimitedMode] = useState(true);
  useEffect(() => { fetch('/api/tutor/session').then(r => r.json()).then(d => { setSession(d.session); setActivity(d.activity); setLimitedMode(d.limitedMode !== false); }).catch(() => setError('The tutor session could not be loaded.')); }, []);

  async function start() {
    setBusy(true); setError(''); setReport(null); setFeedback('');
    try {
      const response = await fetch('/api/tutor/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ budgetMinutes: budget }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details?.join('; ') || data.error);
      setSession(data.session); setActivity(data.activity); setReport(data.report || null); setLimitedMode(data.limitedMode !== false);
    } catch (e: any) { setError(e.message || 'Could not start session.'); } finally { setBusy(false); }
  }

  async function submit() {
    if (!session || !activity || !answer.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/tutor/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, activityId: activity.id, response: answer, assisted }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSession(data.session); setActivity(data.activity); setFeedback(data.feedback || ''); setReport(data.report || null);
      setLimitedMode(data.limitedMode !== false); setAnswer(''); setAssisted(false);
    } catch (e: any) { setError(e.message || 'Your response was not saved.'); } finally { setBusy(false); }
  }

  function speak() {
    if (!activity || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(activity.instruction);
    utterance.lang = 'de-DE'; utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
  function listen() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) { setError('Speech recognition is unavailable in this browser. You can type your answer.'); return; }
    const recognition = new Ctor(); recognition.lang = 'de-DE'; recognition.interimResults = false;
    recognition.onresult = (event: any) => setAnswer(String(event.results[0][0].transcript || ''));
    recognition.onerror = () => setError('Microphone recognition failed. You can type your answer.');
    recognition.start();
  }

  return <main className="container" style={{ maxWidth: 850, paddingTop: 32, paddingBottom: 110 }}>
    <p className="overline">Pilot · Grammatik aktiv B2–C1 · Unit 1</p>
    <h1>Dein Deutsch-Tutor</h1>
    <p>Verbposition in einfachen Sätzen. Der Tutor gibt dir jeweils genau eine Aufgabe und entscheidet danach, was folgt.</p>
    <div role="status" style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, margin: '20px 0' }}>
      {limitedMode ? <><strong>Begrenzter Modus:</strong> Kein geprüfter KI-Tutor ist verbunden. Freie Texte und gesprochene Antworten werden gespeichert, aber nicht als beherrscht bewertet. Browser-Spracherkennung prüft keine Aussprache.</> : <><strong>Lokales Modell verbunden:</strong> Freie Antworten können beurteilt werden. Ergebnisse mit geringer Sicherheit bleiben offen.</>}
      <p style={{ marginBottom: 0 }}>Das Originalaudio zu „Sprechtraining 2“ fehlt. Vorlesen im Browser ist neu erzeugte Übung, keine Aufnahme des Verlags.</p>
    </div>
    {error && <p role="alert" style={{ color: '#ff9b9b' }}>{error}</p>}
    {!session && <section style={{ display: 'grid', gap: 16, marginTop: 30 }}>
      <h2>Heute starten</h2>
      <label>Wie viel Zeit hast du? <select value={budget} onChange={e => setBudget(Number(e.target.value))}>{[15,30,45,60].map(n => <option key={n} value={n}>{n} Minuten</option>)}</select></label>
      <button className="btn primary" disabled={busy} onClick={start}>Geführte Sitzung starten</button>
    </section>}
    {feedback && <div role="status" style={{ padding: 18, background: 'var(--surface)', borderRadius: 12, marginBottom: 20 }}><strong>Rückmeldung</strong><p>{feedback}</p></div>}
    {session && activity && <section style={{ display: 'grid', gap: 16, padding: 22, border: '1px solid var(--border)', borderRadius: 16 }}>
      <div><small>Schritt {session.completed.length + 1} · {activity.phase} · Buch S. {activity.source.printedPage}{activity.source.exercise ? `, Übung ${activity.source.exercise}` : ''}</small></div>
      <h2 style={{ margin: 0 }}>{activity.instruction}</h2>
      {activity.explanation && <p><strong>Erklärung:</strong> {activity.explanation}</p>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn" type="button" onClick={speak}>Anweisung vorlesen</button>{activity.responseMode === 'speech' && <button className="btn" type="button" onClick={listen}>Mikrofon verwenden</button>}</div>
      <label htmlFor="tutor-answer">Deine Antwort</label>
      <textarea id="tutor-answer" rows={activity.phase === 'writing' ? 7 : 4} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Schreibe deine Antwort hier …" style={{ width: '100%', padding: 14, borderRadius: 10 }} />
      <label><input type="checkbox" checked={assisted} onChange={e => setAssisted(e.target.checked)} /> Ich habe Hilfe benutzt oder nachgesehen</label>
      <button className="btn primary" disabled={busy || !answer.trim()} onClick={submit}>Antwort prüfen und weiter</button>
    </section>}
    {report && <section style={{ display: 'grid', gap: 12, marginTop: 22 }}>
      <h2>Sitzungsbericht</h2>
      <p>Bearbeitet: {report.studied.join(', ') || 'Noch keine Aufgaben'}.</p>
      <p>Unabhängig richtig: {report.independentlyCorrect}; Anwendung: {report.applicationCorrect}; offen: {report.uncertain}.</p>
      <p>Textbuch-Abdeckung: {report.textbookCoverage.verifiedPages}/{report.textbookCoverage.totalBookPages} PDF-Seiten als Pilotinhalt geprüft. Übung: {report.practiceCompletion.completed}/{report.practiceCompletion.assigned} zugewiesene Schritte. Nachgewiesene Beherrschung: {report.demonstratedMastery.objectives}/{report.demonstratedMastery.total} Ziele. Verzögerte Behaltensprüfung: {report.retention.passed}/{report.retention.total} Ziele.</p>
      <p>Nächstes Mal: {report.next}</p>
      <button className="btn primary" disabled={busy} onClick={() => { setSession(null); setReport(null); setFeedback(''); }}>Neue Sitzung planen</button>
    </section>}
  </main>;
}

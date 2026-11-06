'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type OAuthStatus = { linked: boolean; last_refresh: string | null; auth_mode: string | null };
type Settings = {
  provider: 'chatgpt-oauth';
  model: string;
  oauth: OAuthStatus;
};

const CHATGPT_MODELS = ['gpt-5.4'];

type TestResult =
  | { ok: true; backend: 'chatgpt-oauth'; model: string; elapsed_ms: number; output: string }
  | { ok: false; backend: 'chatgpt-oauth'; model: string; elapsed_ms: number; error: string };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modelDraft, setModelDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const response = await fetch('/api/settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Einstellungen konnten nicht geladen werden.');
    setSettings(data);
    setModelDraft(data.model);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || String(err)));
  }, []);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      setTest(data);
    } catch (err: any) {
      setTest({ ok: false, backend: 'chatgpt-oauth', model: modelDraft || '?', elapsed_ms: 0, error: err?.message || String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function saveModel(model: string) {
    const next = model.trim();
    if (!next || next === settings?.model) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Modell konnte nicht gespeichert werden.');
      await load();
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <main className="container"><div className="overline">Einstellungen</div><h1 className="display">{error || 'Wird geladen…'}</h1></main>;
  }

  return (
    <main className="container">
      <div className="overline">Einstellungen</div>
      <h1 className="display">ChatGPT OAuth</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Link className="btn" href="/admin/perf">📊 Perf & Fehler</Link>
        <Link className="btn" href="/admin/books">📚 Buch → Quiz</Link>
        <Link className="btn" href="/admin/settings">⚙️ Einstellungen</Link>
      </div>

      {error && <div className="panel" style={{ marginTop: 16, color: '#b8003a' }}>{error}</div>}

      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 800, marginBottom: 10 }}>
          Verbindung
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
          <span style={{
            background: settings.oauth.linked ? 'var(--green-s, #e6f7ec)' : '#ffe4ec',
            color: settings.oauth.linked ? 'var(--green-d)' : '#b8003a',
            padding: '3px 10px', borderRadius: 999, fontWeight: 800, fontSize: 12,
          }}>
            {settings.oauth.linked ? 'VERBUNDEN' : 'NICHT VERBUNDEN'}
          </span>
          <span style={{ color: 'var(--text-mute)' }}>Provider: offizieller SIWC-Anschluss ausstehend</span>
          {settings.oauth.auth_mode && <span style={{ color: 'var(--text-mute)' }}>· Mode: {settings.oauth.auth_mode}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 6 }}>
          Letzter Refresh: {settings.oauth.last_refresh ? new Date(settings.oauth.last_refresh).toLocaleString('de-DE') : '—'}
        </div>
        {!settings.oauth.linked && (
          <div style={{ fontSize: 13, color: 'var(--text-mute)', marginTop: 8 }}>
            Diese Review-Version hat noch keine ChatGPT-Verbindung. Die offizielle Anmeldung folgt nach der Freigabe.
          </div>
        )}
        <button className="btn" onClick={runTest} disabled={testing || !settings.oauth.linked} style={{ marginTop: 12 }}>
          {testing ? 'Wird getestet…' : '🔬 Verbindung jetzt testen'}
        </button>

        {test && (
          <div className="panel" style={{ marginTop: 12, background: 'var(--bg-alt)', padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{
                background: test.ok ? 'var(--green-s, #e6f7ec)' : '#ffe4ec',
                color: test.ok ? 'var(--green-d)' : '#b8003a',
                padding: '3px 10px', borderRadius: 999, fontWeight: 800, fontSize: 11,
              }}>
                {test.ok ? 'LIVE-CALL OK' : 'FEHLER'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
                ChatGPT OAuth · Modell: <code>{test.model}</code> · {test.elapsed_ms} ms
              </span>
            </div>
            <pre style={{
              whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5,
              background: 'var(--bg)', padding: 10, borderRadius: 8, border: '1.5px solid var(--border)', margin: 0,
            }}>{test.ok ? test.output : ('error' in test ? test.error : 'Unbekannter Fehler')}</pre>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 800, marginBottom: 10 }}>
          ChatGPT-Modell
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {CHATGPT_MODELS.map((model) => (
            <button key={model} className={`btn ${settings.model === model ? 'primary' : ''}`} onClick={() => saveModel(model)} disabled>
              {model}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={modelDraft}
          onChange={(event) => setModelDraft(event.target.value)}
          onBlur={() => saveModel(modelDraft)}
          onKeyDown={(event) => { if (event.key === 'Enter') saveModel(modelDraft); }}
          disabled
          style={{ width: '100%', padding: '8px 10px', border: '2px solid var(--border)', borderRadius: 8, fontFamily: 'var(--f-mono)' }}
          placeholder="gpt-5.4"
        />
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 6 }}>
          Die Modellauswahl wird erst nach der offiziellen Anmeldung aktiviert.
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12, fontSize: 13, color: 'var(--text-mute)' }}>
        <strong>Verwendet für:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Schreibübungen generieren</li>
          <li>Antworten bewerten und Grammatik-Tipps erstellen</li>
          <li>Wortfamilien für Vokabeln laden</li>
        </ul>
      </div>
    </main>
  );
}

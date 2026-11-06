'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (r.ok) router.push('/');
      else setErr('Falsche Zugangsdaten.');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="rise rise-1" style={{ alignSelf: 'start', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 800 }}>
        Schreibheft · Deutsch
      </div>
      <div className="login-hero">
        <div className="kicker rise rise-1">Täglich Deutsch</div>
        <h1 className="rise rise-2">
          Heute <span className="em">üben</span>,<br/>morgen <span className="em2">können</span>.
        </h1>
        <p className="sub rise rise-3">Tägliche Aufgaben, XP und Streaks — ein Wortschatz, der wirklich hängen bleibt.</p>

        <form onSubmit={submit} className="rise rise-4">
          <div className="field">
            <label>Benutzer</label>
            <input className="input" placeholder="deinname" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="off" autoCorrect="off" />
          </div>
          <div className="field">
            <label>Passwort</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && (
            <div className="feedback bad" style={{ marginTop: 14 }}>
              <div className="fb-heading">Falsche Zugangsdaten</div>
              <div className="fb-msg">{err}</div>
            </div>
          )}
          <button className="btn primary xl full" style={{ marginTop: 22 }} type="submit" disabled={busy}>
            {busy ? 'Moment…' : 'Los geht\'s'}
          </button>
        </form>
      </div>
      <div className="foot rise rise-4">A1 → C1 · zum Mitnehmen</div>
    </div>
  );
}

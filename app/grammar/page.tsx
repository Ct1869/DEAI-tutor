'use client';
import { useEffect, useState } from 'react';
import { ClickableText } from '@/app/components/ClickableText';

type Tip = {
  id: number;
  trigger_phrase: string;
  rule: string;
  example: string;
  memory_hook: string;
  created_at: number;
};

export default function GrammarPage() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    const d = await fetch('/api/grammar').then((r) => r.json());
    setTips(d.tips || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function dismiss(id: number) {
    await fetch('/api/grammar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setTips((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleFlip(id: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <main className="container">
        <div className="overline rise rise-1">Grammatik</div>
        <p className="muted rise rise-2" style={{ marginTop: 16 }}>Laden…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="overline rise rise-1">Grammatik-Tipps</div>
      <h1 className="display rise rise-1">Deine <span className="em">Regeln</span>.</h1>
      <p className="muted rise rise-2" style={{ marginTop: -6, marginBottom: 22, fontWeight: 500 }}>
        {tips.length} {tips.length === 1 ? 'Tipp' : 'Tipps'} gesammelt · tippe zum Aufklappen
      </p>

      {tips.length === 0 && (
        <div className="panel rise rise-2">
          <div className="empty">
            <div className="big">Noch keine Tipps</div>
            <div className="sub">Mach Schreibübungen — Fehler werden automatisch gespeichert.</div>
          </div>
        </div>
      )}

      {tips.map((tip, i) => {
        const open = flipped.has(tip.id);
        return (
          <div
            key={tip.id}
            className={`rise rise-${Math.min(i + 2, 5)}`}
            style={{ marginBottom: 12, cursor: 'pointer' }}
            onClick={() => toggleFlip(tip.id)}
          >
            <div style={{
              padding: '16px 18px',
              background: open ? 'var(--purple-d)' : 'var(--bg)',
              color: open ? '#fff' : 'var(--text)',
              border: `2px solid ${open ? 'var(--purple-d)' : 'var(--border)'}`,
              borderRadius: 'var(--r-md)',
              transition: 'background .2s, color .2s, border-color .2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    fontWeight: 800, marginBottom: 6,
                    color: open ? 'rgba(255,255,255,0.7)' : 'var(--purple-d)',
                  }}>
                    {tip.trigger_phrase}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{tip.rule}</div>

                  {open && (
                    <>
                      <div style={{
                        fontFamily: 'var(--f-mono)', fontSize: 14,
                        background: 'rgba(255,255,255,0.15)',
                        padding: '8px 12px', borderRadius: 8,
                        marginTop: 10, lineHeight: 1.4,
                      }}>
                        <ClickableText text={tip.example} example={tip.example} />
                      </div>
                      <div style={{ fontSize: 13, marginTop: 10, opacity: 0.85, fontStyle: 'italic' }}>
                        💡 {tip.memory_hook}
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="btn ghost icon"
                  style={{
                    minWidth: 34, minHeight: 34, fontSize: 14,
                    flexShrink: 0,
                    background: open ? 'rgba(255,255,255,0.15)' : undefined,
                    color: open ? '#fff' : undefined,
                    border: open ? '2px solid rgba(255,255,255,0.3)' : undefined,
                  }}
                  onClick={(e) => { e.stopPropagation(); dismiss(tip.id); }}
                  title="Löschen"
                >✕</button>
              </div>
            </div>
          </div>
        );
      })}

      {tips.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Tippe eine Karte zum Aufklappen · ✕ zum Entfernen wenn du die Regel drauf hast
        </p>
      )}
    </main>
  );
}

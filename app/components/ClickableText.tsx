'use client';
import { useMemo, useState } from 'react';
import { speakText } from '@/lib/speech';

function speak(text: string, slow = false) { speakText(text, 'de-DE', slow ? 0.68 : 0.9); }

export async function markVocab(word: string, extra?: { translation?: string | null; example?: string | null; examples?: string[]; family?: unknown[] }) {
  try {
    await fetch('/api/vocab/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        translation: extra?.translation ?? null,
        example: extra?.example ?? null,
        examples: extra?.examples ?? [],
        family: extra?.family ?? [],
      }),
    });
  } catch {}
}

export type LookupResult = {
  translation: string | null;
  senses: string[];
  examples: string[];
  family: Array<{ word: string; translation: string; type: string }>;
  source: string | null;
  arabic: string | null;
};

const EMPTY_LOOKUP: LookupResult = { translation: null, senses: [], examples: [], family: [], source: null, arabic: null };

async function lookupWordQuick(word: string): Promise<LookupResult> {
  try {
    const r = await fetch(`/api/vocab/lookup?word=${encodeURIComponent(word)}&quick=1`);
    if (!r.ok) return EMPTY_LOOKUP;
    const d = await r.json();
    return {
      translation: d.translation ?? null,
      senses: Array.isArray(d.senses) ? d.senses : [],
      examples: d.examples ?? [],
      family: d.family ?? [],
      source: d.source ?? null,
      arabic: d.arabic ?? null,
    };
  } catch { return EMPTY_LOOKUP; }
}

async function lookupWordFull(word: string): Promise<LookupResult> {
  try {
    const r = await fetch(`/api/vocab/lookup?word=${encodeURIComponent(word)}`);
    if (!r.ok) return EMPTY_LOOKUP;
    const d = await r.json();
    return {
      translation: d.translation ?? null,
      senses: Array.isArray(d.senses) ? d.senses : [],
      examples: d.examples ?? [],
      family: d.family ?? [],
      source: d.source ?? null,
      arabic: d.arabic ?? null,
    };
  } catch { return EMPTY_LOOKUP; }
}

const TYPE_COLORS: Record<string, string> = {
  noun: 'var(--gold-d)',
  verb: 'var(--green-d)',
  adj: 'var(--blue-d)',
  related: 'var(--purple-d)',
};

export function ClickableText({ text, example }: { text: string; example?: string | null }) {
  const [active, setActive] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupResult>(EMPTY_LOOKUP);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [added, setAdded] = useState(false);

  const tokens = useMemo(() => {
    return text.split(/(\s+|[.,;:!?„"""()\[\]…—–-])/g).filter((t) => t !== '');
  }, [text]);

  async function openWord(w: string) {
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!clean) return;
    setActive(clean);
    setAdded(false);
    setLookup(EMPTY_LOOKUP);
    setLoading(true);
    const quick = await lookupWordQuick(clean);
    setLookup(quick);
    setLoading(false);
    // Background enrichment: fetch examples + family without blocking
    setEnriching(true);
    lookupWordFull(clean).then((full) => {
      setLookup((cur) => ({
        translation: cur.translation || full.translation,
        senses: cur.senses.length > 0 ? cur.senses : full.senses,
        examples: full.examples,
        family: full.family,
        source: cur.source || full.source,
        arabic: cur.arabic || full.arabic,
      }));
    }).finally(() => setEnriching(false));
  }

  async function addCurrent() {
    if (!active) return;
    await markVocab(active, {
      translation: lookup.translation,
      example: example || text,
      examples: lookup.examples,
      family: lookup.family,
    });
    setAdded(true);
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // Only show a real Wiktionary/dictionary example — never the whole question prompt.
  const displayExample = lookup.examples[0] || null;

  return (
    <>
      <span className="clickable-prompt">
        {tokens.map((t, i) => {
          const isWord = /\p{L}/u.test(t);
          if (!isWord) return <span key={i}>{t}</span>;
          return (
            <span key={i} className="clickable-word" onClick={() => openWord(t)}>{t}</span>
          );
        })}
      </span>
      {active && (
        <div className="word-pop-backdrop" onClick={() => setActive(null)}>
          <div className="word-pop" onClick={(e) => e.stopPropagation()}>
            <button className="word-pop-close" onClick={() => setActive(null)} aria-label="Schließen">×</button>
            <div className="word-pop-word">
              {active}
              {lookup.source && (
                <span style={{ fontSize: 13, marginLeft: 8, opacity: 0.7 }} title={lookup.source}>
                  {lookup.source === 'wiktionary' ? '📖' : '🌐'}
                </span>
              )}
            </div>
            <div className="word-pop-xltn">
              {loading ? 'Übersetze…' : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.05em', marginRight: 6 }}>EN</span>
                  {lookup.translation || '—'}
                </>
              )}
            </div>
            {!loading && lookup.arabic && (
              <div className="word-pop-xltn" dir="rtl" lang="ar" style={{
                fontFamily: '"Noto Naskh Arabic", "Amiri", "Segoe UI", serif',
                fontSize: 18, marginTop: -4, marginBottom: 8, textAlign: 'right',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.05em', marginLeft: 6, direction: 'ltr', display: 'inline-block' }}>AR</span>
                {lookup.arabic}
              </div>
            )}
            {!loading && lookup.senses.length > 1 && (
              <ol style={{ margin: '6px 0 12px', paddingLeft: 22, fontSize: 13, color: 'var(--text-mute)', lineHeight: 1.5 }}>
                {lookup.senses.slice(0, 6).map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
              </ol>
            )}
            {displayExample && (
              <div className="word-pop-example">„{displayExample}"</div>
            )}
            {enriching && !loading && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, fontStyle: 'italic' }}>Weitere Details werden geladen…</div>
            )}
            {!loading && lookup.family.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 800, marginBottom: 8 }}>
                  Wortfamilie
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lookup.family.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '4px 10px',
                        background: 'var(--bg-alt)',
                        border: `2px solid var(--border)`,
                        borderRadius: 8,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                      onClick={() => speak(f.word)}
                      title={f.translation}
                    >
                      <span style={{ fontWeight: 700, color: TYPE_COLORS[f.type] ?? 'var(--text)' }}>{f.word}</span>
                      <span style={{ color: 'var(--text-mute)', marginLeft: 4, fontSize: 11 }}>{f.translation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="word-pop-actions">
              <button className="btn icon" onClick={() => speak(active)} aria-label="Hören">🔊</button>
              <button
                className={`btn primary ${added ? 'disabled' : ''}`}
                onClick={addCurrent}
                disabled={added}
              >
                {added ? '✓ Hinzugefügt' : '+ Zum Wortschatz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

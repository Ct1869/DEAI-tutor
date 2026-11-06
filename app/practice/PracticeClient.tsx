'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, PRACTICE_CARDS, type PracticeCard, type PracticeLanguage, type PracticeLevel } from '@/lib/practice-cards';
import { hasGermanVoice, speakText, warmSpeech } from '@/lib/speech';
import { ClickableText } from '@/app/components/ClickableText';

const LEVELS: Array<PracticeLevel | 'MIX'> = ['A1', 'A2', 'B1', 'B2', 'C1', 'MIX'];
const LANGUAGES: PracticeLanguage[] = ['de', 'en', 'ar'];
const SPEECH_LANG: Record<PracticeLanguage, string> = { de: 'de-DE', en: 'en-US', ar: 'ar-SA' };

function shuffledIndexes(length: number, seed: number) {
  const values = Array.from({ length }, (_, index) => index);
  let state = seed || 1;
  for (let index = values.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const target = state % (index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

export default function PracticeClient() {
  const [target, setTarget] = useState<PracticeLanguage>('de');
  const [translation, setTranslation] = useState<PracticeLanguage>('en');
  const [level, setLevel] = useState<PracticeLevel | 'MIX'>('B2');
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [seed, setSeed] = useState(19);
  const [genCards, setGenCards] = useState<PracticeCard[] | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [noGermanVoice, setNoGermanVoice] = useState(false);

  // Fresh AI batch takes over the deck when present; otherwise the built-in set for the level.
  const cards = useMemo(() => {
    if (genCards && genCards.length) return genCards;
    return level === 'MIX' ? PRACTICE_CARDS : PRACTICE_CARDS.filter((card) => card.level === level);
  }, [genCards, level]);
  const order = useMemo(() => shuffledIndexes(cards.length, seed), [cards.length, seed]);
  const card = cards[order[position % Math.max(1, order.length)]];

  function chooseTarget(next: PracticeLanguage) {
    setTarget(next);
    if (next === translation) setTranslation(LANGUAGES.find((language) => language !== next) || 'en');
    setRevealed(false);
  }

  function chooseTranslation(next: PracticeLanguage) {
    if (next === target) {
      setTarget(translation);
      setTranslation(next);
    } else setTranslation(next);
    setRevealed(false);
  }

  function swap() {
    setTarget(translation);
    setTranslation(target);
    setRevealed(false);
  }

  const move = useCallback((delta: number) => {
    setPosition((current) => (current + delta + cards.length) % cards.length);
    setRevealed(false);
  }, [cards.length]);

  function speak(slow = false) {
    if (!card) return;
    speakText(card[target], SPEECH_LANG[target], slow ? 0.68 : target === 'ar' ? 0.84 : 0.9);
  }

  // Sentences come from a server-side pool that a background job keeps topped
  // up, so a refresh always rotates to unseen ones instead of replaying the
  // static deck, and no request waits on the ~20s generation.
  const loadFromPool = useCallback(async (lvl: PracticeLevel | 'MIX', { silent = false } = {}) => {
    if (!silent) setGenLoading(true);
    setGenError(null);
    try {
      const r = await fetch(`/api/practice/pool?level=${encodeURIComponent(lvl)}&count=8`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !Array.isArray(d.cards) || !d.cards.length) {
        throw new Error(d.detail || d.error || 'Konnte keine Sätze laden');
      }
      setGenCards(d.cards as PracticeCard[]);
      setPosition(0);
      setRevealed(false);
      setSeed(Date.now() >>> 0);
    } catch (e: any) {
      // Leave whatever is on screen; the built-in deck is the offline fallback.
      setGenError(String(e?.message || e));
    } finally {
      if (!silent) setGenLoading(false);
    }
  }, []);

  function generate() {
    if (genLoading) return;
    loadFromPool(level);
  }

  useEffect(() => {
    warmSpeech();
    // Voices arrive async; re-check for a beat before warning, otherwise we'd
    // flash the banner on every load.
    let tries = 0;
    const timer = setInterval(() => {
      if (hasGermanVoice()) { setNoGermanVoice(false); clearInterval(timer); }
      else if (++tries > 12) { setNoGermanVoice(true); clearInterval(timer); }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Fresh sentences on every mount and whenever the level changes.
  useEffect(() => {
    setGenCards(null);
    loadFromPool(level);
  }, [level, loadFromPool]);

  useEffect(() => {
    function keys(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setRevealed((value) => !value); }
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [move]);

  if (!card) return null;
  const rtlTarget = target === 'ar';
  const rtlTranslation = translation === 'ar';

  return (
    <main className="practice-shell">
      <section className="practice-top">
        <div><div className="overline">Quick Practice</div><h1>Ein Satz. Volle Aufmerksamkeit.</h1></div>
        <div className="practice-controls">
          <label><span>Lernsprache</span><select value={target} onChange={(event) => chooseTarget(event.target.value as PracticeLanguage)}>{LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_FLAGS[language]} {LANGUAGE_LABELS[language]}</option>)}</select></label>
          <button className="swap-button" onClick={swap} aria-label="Sprachen tauschen" title="Sprachen tauschen">⇄</button>
          <label><span>Übersetzung</span><select value={translation} onChange={(event) => chooseTranslation(event.target.value as PracticeLanguage)}>{LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_FLAGS[language]} {LANGUAGE_LABELS[language]}</option>)}</select></label>
          <label><span>Niveau</span><select value={level} onChange={(event) => setLevel(event.target.value as PracticeLevel | 'MIX')}>{LEVELS.map((item) => <option key={item} value={item}>{item === 'MIX' ? 'Alle Niveaus' : item}</option>)}</select></label>
        </div>
      </section>

      <section className="lingo-board" aria-live="polite">
        <div className="board-meta">
          <span>{LANGUAGE_LABELS[target].toUpperCase()} · {card.level}{genCards ? ' · KI' : ''}</span>
          <span>{String(position + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}</span>
        </div>
        <div className="board-topic">{card.topic}</div>
        <div className="board-level">{card.level}</div>
        <div className="board-sentence" dir={rtlTarget ? 'rtl' : 'ltr'} lang={target}>
          {target === 'de'
            ? <ClickableText key={card.id} text={card.de} example={card.de} />
            : card[target]}
        </div>
        {target === 'de' && <div className="board-tap-hint">Tippe ein Wort, um es zu übersetzen und zum Wortschatz hinzuzufügen</div>}
        <div className="listen-controls">
          <button className="listen-button" onClick={() => speak(false)}>▶ Natürlich</button>
          <button className="listen-button subtle" onClick={() => speak(true)}>½ Langsam</button>
        </div>
        <button className={`reveal-panel ${revealed ? 'open' : ''}`} onClick={() => setRevealed((value) => !value)}>
          <span className="reveal-label">{revealed ? `${LANGUAGE_FLAGS[translation]} ${LANGUAGE_LABELS[translation]}` : 'Übersetzung zeigen'}</span>
          {revealed && <strong dir={rtlTranslation ? 'rtl' : 'ltr'} lang={translation}>{card[translation]}</strong>}
        </button>
      </section>

      <div className="practice-nav">
        <button onClick={() => move(-1)} aria-label="Vorherige Karte">←</button>
        <button className="btn primary" onClick={generate} disabled={genLoading}>
          {genLoading ? 'Generiere…' : '＋ Neue Sätze'}
        </button>
        <button onClick={() => move(1)} aria-label="Nächste Karte">→</button>
      </div>
      {genError && <p className="practice-hint" style={{ color: 'var(--red)' }}>{genError}</p>}
      {noGermanVoice && target === 'de' && (
        <p className="practice-hint" style={{ color: 'var(--red)' }}>
          Keine deutsche Stimme installiert — dein Gerät liest Deutsch mit einer fremden Stimme vor.
          Installiere eine de-DE-Stimme in den Systemeinstellungen (Sprache &amp; Eingabe → Text-in-Sprache).
        </p>
      )}
      <p className="practice-hint">
        {genCards ? 'Frische KI-Sätze · ' : ''}Leertaste: Übersetzung · Pfeiltasten: blättern · „Neue Sätze" holt frische Sätze
      </p>
    </main>
  );
}

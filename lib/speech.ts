'use client';

// Browser TTS. The main correctness bug this guards against: getVoices() is
// populated asynchronously, so an early call returns [] and the utterance falls
// back to the UI-locale voice (English) reading German text. We warm the voice
// list and always bind an actual de-* voice when one exists.

const PREMIUM_HINTS = ['natural', 'premium', 'enhanced', 'neural', 'google', 'microsoft', 'siri'];

let voicesCache: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

function waitForVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  refreshVoices();
  if (voicesCache.length) return Promise.resolve(voicesCache);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      refreshVoices();
      if (voicesCache.length || Date.now() - start > timeoutMs) resolve(voicesCache);
      else setTimeout(tick, 120);
    };
    tick();
  });
}

function pickVoice(language: string): SpeechSynthesisVoice | undefined {
  const prefix = language.toLowerCase().split('-')[0];
  const matches = voicesCache.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  if (!matches.length) return undefined;
  return matches.sort((a, b) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      // Region match must outrank the "premium" name hints: a plain de-DE voice
      // reads German better than a fancy de-AT/de-CH one.
      return (voice.lang.toLowerCase() === language.toLowerCase() ? 40 : 0)
        + PREMIUM_HINTS.reduce((total, hint) => total + (name.includes(hint) ? 10 : 0), 0)
        + (voice.localService ? 2 : 0);
    };
    return score(b) - score(a);
  })[0];
}

// Warm the engine early (call once on an interactive page) so the first tap speaks instantly.
export function warmSpeech() { waitForVoices(); }

export function speakText(text: string, language = 'de-DE', rate = 0.9): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return false;
  const synth = window.speechSynthesis;

  // cancel() unconditionally is what silently swallows the utterance in Chrome:
  // cancel-then-speak in the same tick drops it. Only clear a real backlog.
  if (synth.speaking || synth.pending) synth.cancel();
  // Chrome can leave the engine paused after a backgrounded tab; speak() is a no-op then.
  synth.resume();

  const speak = () => {
    const voice = pickVoice(language);
    const utterance = new SpeechSynthesisUtterance(text);
    // Bind the resolved voice's own lang so the engine can't fall back to the UI locale.
    utterance.lang = voice ? voice.lang : language;
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  };

  // Speaking must stay inside the user's tap: an awaited voice list loses the
  // gesture (mobile blocks it) and, worse, speaks before a de-* voice is bound,
  // which is what read German words in an English voice. Refresh synchronously
  // first — after warmSpeech() the list is already there.
  refreshVoices();
  if (voicesCache.length) speak();
  else waitForVoices().then(speak);
  return true;
}

// True only when a real German voice is installed — lets the UI warn instead of mispronouncing.
export function hasGermanVoice(): boolean {
  refreshVoices();
  return voicesCache.some((v) => v.lang.toLowerCase().startsWith('de'));
}

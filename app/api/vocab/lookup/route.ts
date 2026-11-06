import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchWordFamily } from '@/lib/ai';

const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
  'https://lingva.tiekoetter.com',
];

const QUICK_TIMEOUT = 2500;
const FULL_TIMEOUT = 4000;

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchLingva(base: string, word: string, timeoutMs: number): Promise<string | null> {
  try {
    const r = await fetch(`${base}/api/v1/de/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const t = d?.translation as string | undefined;
    if (t && t.toLowerCase() !== word.toLowerCase()) return t;
  } catch {}
  return null;
}

async function translateLingvaRace(word: string, timeoutMs: number): Promise<string | null> {
  const tasks = LINGVA_INSTANCES.map((b) => fetchLingva(b, word, timeoutMs).then((v) => v ?? Promise.reject()));
  try {
    return await Promise.any(tasks);
  } catch { return null; }
}

async function translateMyMemory(word: string, timeoutMs: number, langpair = 'de|en'): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${langpair}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    const d: any = await r.json();
    const t = d?.responseData?.translatedText as string | undefined;
    if (t && t.toLowerCase() !== word.toLowerCase()) return t;
  } catch {}
  return null;
}

async function translateLingvaDirect(word: string, targetLang: string, timeoutMs: number): Promise<string | null> {
  const tasks = LINGVA_INSTANCES.map((base) =>
    fetch(`${base}/api/v1/de/${targetLang}/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(timeoutMs) })
      .then(async (r) => {
        if (!r.ok) return Promise.reject();
        const d: any = await r.json();
        const t = d?.translation as string | undefined;
        if (t && t.toLowerCase() !== word.toLowerCase()) return t;
        return Promise.reject();
      })
  );
  try { return await Promise.any(tasks); } catch { return null; }
}

type Wikt = { translation: string | null; senses: string[]; article: string | null; partOfSpeech: string | null };

async function translateWiktionary(word: string, timeoutMs: number): Promise<Wikt> {
  const variants = Array.from(new Set([
    word,
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    word.toLowerCase(),
  ]));
  for (const v of variants) {
    try {
      const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(v)}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Api-User-Agent': 'jmcworld-deutsch/1.0' },
      });
      if (!r.ok) continue;
      const d: any = await r.json();
      const de = d?.de;
      if (!Array.isArray(de) || de.length === 0) continue;
      const senses: string[] = [];
      const grammarRefs: string[] = [];
      let pos: string | null = null;
      let article: string | null = null;
      // Grammatical-reference definitions ("agent noun of X", "plural of X", "feminine of X", etc.) are not
      // useful as the primary EN translation — keep them for the senses list but don't headline them.
      const REF_RE = /^(agent noun of|plural of|feminine of|masculine of|diminutive of|inflection of|form of|past participle of|past tense of|present participle of|nominalization of|genitive of|dative of|accusative of|comparative of|superlative of|alternative form of|alternative spelling of|abbreviation of)\b/i;
      for (const entry of de) {
        if (!pos && entry.partOfSpeech) pos = entry.partOfSpeech;
        for (const def of entry.definitions ?? []) {
          const text = stripHtml(def.definition || '');
          if (!text) continue;
          const cleaned = text.replace(/^\([^)]*\)\s*/, '').trim();
          if (!cleaned) continue;
          if (REF_RE.test(cleaned)) grammarRefs.push(cleaned);
          else senses.push(cleaned);
          if (senses.length >= 6) break;
        }
        if (senses.length >= 6) break;
      }
      // If only grammatical references were found (e.g. "Bohrer" → "agent noun of bohren"), fall through to MT.
      if (senses.length === 0) continue;
      // Infer article from POS marker (Wiktionary often says "Noun" but gender shows in the page; we leave article null here)
      // Take first 1-2 senses as the headline translation
      const translation = senses.slice(0, 2).join('; ').slice(0, 140) || null;
      if (translation) return { translation, senses, article, partOfSpeech: pos };
    } catch {}
  }
  return { translation: null, senses: [], article: null, partOfSpeech: null };
}

async function fetchGermanExamples(word: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/de/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(FULL_TIMEOUT) }
    );
    if (!r.ok) return [];
    const data: any[] = await r.json();
    const examples: string[] = [];
    for (const entry of data) {
      for (const meaning of entry.meanings ?? []) {
        for (const def of meaning.definitions ?? []) {
          if (def.example) examples.push(def.example as string);
          if (examples.length >= 3) return examples;
        }
      }
    }
    return examples;
  } catch {
    return [];
  }
}

function cacheGet(word: string) {
  return getDb()
    .prepare('SELECT translation, senses, source, arabic FROM lookup_cache WHERE word = ? COLLATE NOCASE')
    .get(word) as { translation: string | null; senses: string | null; source: string | null; arabic: string | null } | undefined;
}

function cachePut(word: string, translation: string | null, senses: string[], source: string, arabic: string | null) {
  if (!translation) return;
  getDb().prepare(
    `INSERT INTO lookup_cache(word, translation, senses, source, arabic, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(word) DO UPDATE SET
       translation = excluded.translation,
       senses = excluded.senses,
       source = excluded.source,
       arabic = COALESCE(excluded.arabic, lookup_cache.arabic),
       updated_at = excluded.updated_at`
  ).run(word.toLowerCase(), translation, JSON.stringify(senses), source, arabic, Date.now());
}

async function fetchArabic(word: string, timeoutMs: number): Promise<string | null> {
  // Race Lingva + MyMemory for de→ar
  return Promise.any([
    translateLingvaDirect(word, 'ar', timeoutMs).then((v) => v ?? Promise.reject()),
    translateMyMemory(word, timeoutMs, 'de|ar').then((v) => v ?? Promise.reject()),
  ]).catch(() => null);
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const wordRaw = (url.searchParams.get('word') || '').trim();
  const quick = url.searchParams.get('quick') === '1';
  if (!wordRaw) return NextResponse.json({ error: 'word required' }, { status: 400 });

  const cleaned = wordRaw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!cleaned) return NextResponse.json({ word: wordRaw, translation: null });

  const db = getDb();

  // 1) vocab table (user already added this word)
  const existing = db
    .prepare('SELECT word, translation, article, example, examples, family FROM vocab WHERE word = ? COLLATE NOCASE')
    .get(cleaned) as any;
  if (existing?.translation) {
    return NextResponse.json({
      word: existing.word,
      translation: existing.translation,
      article: existing.article,
      example: existing.example,
      examples: existing.examples ? JSON.parse(existing.examples) : [],
      family: existing.family ? JSON.parse(existing.family) : [],
      senses: [],
      cached: 'vocab',
    });
  }

  // 2) lookup_cache (a previous tap already resolved this word)
  const cached = cacheGet(cleaned);
  if (cached?.translation) {
    const senses = cached.senses ? safeParse<string[]>(cached.senses, []) : [];
    // If Arabic missing from cache, fetch in the background (don't block).
    let arabic = cached.arabic;
    if (!arabic) {
      try {
        arabic = await fetchArabic(cleaned, quick ? QUICK_TIMEOUT : FULL_TIMEOUT);
        if (arabic) cachePut(cleaned, cached.translation, senses, cached.source || 'cache', arabic);
      } catch {}
    }
    if (quick) {
      return NextResponse.json({ word: cleaned, translation: cached.translation, senses, arabic, source: cached.source, cached: 'lookup' });
    }
    const [examples, family] = await Promise.all([
      fetchGermanExamples(cleaned),
      fetchWordFamily(cleaned),
    ]);
    return NextResponse.json({ word: cleaned, translation: cached.translation, senses, arabic, examples, family, source: cached.source, cached: 'lookup' });
  }

  // 3) Quick mode: race Wiktionary, parallel Lingva, MyMemory — first wins; Arabic in parallel
  if (quick) {
    const timeoutMs = QUICK_TIMEOUT;
    const wiktP = translateWiktionary(cleaned, timeoutMs);
    const lingvaP = translateLingvaRace(cleaned, timeoutMs);
    const mmP = translateMyMemory(cleaned, timeoutMs);
    const arP = fetchArabic(cleaned, timeoutMs);

    // Prefer Wiktionary if it returns in time, else first non-null of others
    const wikt = await Promise.race([
      wiktP.then((w) => (w.translation ? w : Promise.reject())),
      new Promise<Wikt>((_, rej) => setTimeout(rej, 1200)),
    ]).catch(() => null);

    if (wikt && wikt.translation) {
      const arabic = await arP;
      cachePut(cleaned, wikt.translation, wikt.senses, 'wiktionary', arabic);
      return NextResponse.json({
        word: cleaned, translation: wikt.translation, senses: wikt.senses,
        partOfSpeech: wikt.partOfSpeech, arabic, source: 'wiktionary',
      });
    }
    const mt = await Promise.any([
      lingvaP.then((v) => v ?? Promise.reject()),
      mmP.then((v) => v ?? Promise.reject()),
      wiktP.then((w) => w.translation ?? Promise.reject()),
    ]).catch(() => null);

    const senses = wikt?.senses ?? [];
    const source = mt && wikt?.translation === mt ? 'wiktionary' : (mt ? 'mt' : 'none');
    const arabic = await arP;
    if (mt) cachePut(cleaned, mt, senses, source, arabic);
    return NextResponse.json({ word: cleaned, translation: mt, senses, arabic, source });
  }

  // 4) Full mode (vocab page): everything
  const [wikt, lingva, mm, arabic, examples, family] = await Promise.all([
    translateWiktionary(cleaned, FULL_TIMEOUT),
    translateLingvaRace(cleaned, FULL_TIMEOUT),
    translateMyMemory(cleaned, FULL_TIMEOUT),
    fetchArabic(cleaned, FULL_TIMEOUT),
    fetchGermanExamples(cleaned),
    fetchWordFamily(cleaned),
  ]);
  const translation = wikt.translation || lingva || mm || null;
  const source = wikt.translation ? 'wiktionary' : lingva ? 'lingva' : mm ? 'mymemory' : 'none';
  if (translation) cachePut(cleaned, translation, wikt.senses, source, arabic);
  return NextResponse.json({
    word: cleaned, translation, senses: wikt.senses, partOfSpeech: wikt.partOfSpeech,
    arabic, examples, family, source,
  });
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

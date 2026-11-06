const ARTICLES = ['der', 'die', 'das'] as const;

/**
 * Splits a headword that has its article baked in ("die Kälte") into its parts,
 * and drops articles on non-nouns. German nouns are capitalised, so a headword
 * whose first *capitalised* token is absent means verb/adjective — no article.
 */
export function normalizeVocabWord(rawWord: string, rawArticle?: string | null): { word: string; article: string | null } {
  let word = (rawWord || '').trim().replace(/\s+/g, ' ');
  let article = (rawArticle || '').trim().toLowerCase();

  const sp = word.indexOf(' ');
  if (sp > 0) {
    const lead = word.slice(0, sp).toLowerCase();
    if ((ARTICLES as readonly string[]).includes(lead)) {
      article = lead;
      word = word.slice(sp + 1).trim();
    }
  }

  if (!(ARTICLES as readonly string[]).includes(article)) return { word, article: null };
  // A noun phrase may start with a lowercase adjective ("provisorische Krone"),
  // so look for a capitalised token anywhere rather than only at position 0.
  const isNoun = word.split(' ').some((t) => /^[A-ZÄÖÜ]/.test(t));
  return { word, article: isNoun ? article : null };
}

/** Renders a vocab entry for display/TTS, tolerating dirty legacy rows. */
export function displayVocabWord(rawWord: string, rawArticle?: string | null): string {
  const { word, article } = normalizeVocabWord(rawWord, rawArticle);
  return article ? `${article} ${word}` : word;
}

import { chat } from './llm';

export type FamilyMember = { word: string; translation: string; type: 'noun' | 'verb' | 'adj' | 'related' };

export async function fetchWordFamily(word: string): Promise<FamilyMember[]> {
  try {
    const text = await chat([
      {
        role: 'user',
        content: `Word family for the German word "${word}". List up to 6 real, common related forms.
Return ONLY valid JSON array, no explanation:
[{"word":"...","translation":"...","type":"noun|verb|adj|related"}]
Include: nouns (with article), verb (infinitive), adjectives, key derivatives. Skip the word itself.`,
      },
    ], 1024);
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed.slice(0, 6);
  } catch {}
  return [];
}

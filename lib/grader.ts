// Strict grader: case-insensitive, whitespace-collapsing, but HARSH on umlauts (ä/ö/ü/ß).
// Returns a character-level edit script so the UI can show which letters are wrong.

export type Issue =
  | { kind: 'substitute'; expected: string; got: string; at: number; umlaut: boolean }
  | { kind: 'missing'; expected: string; at: number; umlaut: boolean }
  | { kind: 'extra'; got: string; at: number };

export type DiffChunk =
  | { t: 'ok'; s: string }
  | { t: 'sub'; expected: string; got: string; umlaut: boolean }
  | { t: 'miss'; expected: string; umlaut: boolean }
  | { t: 'extra'; got: string };

const UMLAUT = new Set(['ä', 'ö', 'ü', 'ß']);
const UMLAUT_BASE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 's' };

export function normalize(s: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isUmlaut(c: string) { return UMLAUT.has(c.toLowerCase()); }
function isUmlautPair(expected: string, got: string) {
  const e = expected.toLowerCase(), g = got.toLowerCase();
  if (UMLAUT.has(e) && UMLAUT_BASE[e] === g) return true; // user wrote base instead of umlaut
  if (e === 'ß' && (g === 's' || g === 'ss')) return true;
  return false;
}

export function gradeStrict(expected: string, got: string) {
  const e = normalize(expected);
  const g = normalize(got);
  if (e === g) return { correct: true, issues: [] as Issue[], diff: [{ t: 'ok', s: expected }] as DiffChunk[], message: 'Perfekt. So schreibt man das.' };

  const m = e.length, n = g.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = e[i - 1] === g[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }

  const issues: Issue[] = [];
  const diff: DiffChunk[] = [];
  let i = m, j = n;
  const ops: { type: 'ok' | 'sub' | 'miss' | 'extra'; e?: string; g?: string; at: number }[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && e[i - 1] === g[j - 1]) { ops.push({ type: 'ok', e: e[i - 1], g: g[j - 1], at: i - 1 }); i--; j--; continue; }
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ type: 'sub', e: e[i - 1], g: g[j - 1], at: i - 1 }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j] === dp[i][j - 1] + 1)) {
      ops.push({ type: 'extra', g: g[j - 1], at: i }); j--;
    } else {
      ops.push({ type: 'miss', e: e[i - 1], at: i - 1 }); i--;
    }
  }
  ops.reverse();

  // Collapse runs of 'ok' into one chunk for readability
  let buf = '';
  for (const op of ops) {
    if (op.type === 'ok') { buf += op.e; continue; }
    if (buf) { diff.push({ t: 'ok', s: buf }); buf = ''; }
    if (op.type === 'sub') {
      const umlaut = isUmlaut(op.e!) || isUmlaut(op.g!) || isUmlautPair(op.e!, op.g!);
      diff.push({ t: 'sub', expected: op.e!, got: op.g!, umlaut });
      issues.push({ kind: 'substitute', expected: op.e!, got: op.g!, at: op.at, umlaut });
    } else if (op.type === 'miss') {
      const umlaut = isUmlaut(op.e!);
      diff.push({ t: 'miss', expected: op.e!, umlaut });
      issues.push({ kind: 'missing', expected: op.e!, at: op.at, umlaut });
    } else {
      diff.push({ t: 'extra', got: op.g! });
      issues.push({ kind: 'extra', got: op.g!, at: op.at });
    }
  }
  if (buf) diff.push({ t: 'ok', s: buf });

  return { correct: false, issues, diff, message: meanTeacher(expected, issues) };
}

function meanTeacher(expected: string, issues: Issue[]): string {
  const umlautIssues = issues.filter((x) => (x.kind !== 'extra' && x.umlaut));
  if (umlautIssues.length > 0) {
    const pieces = umlautIssues.slice(0, 3).map((iss) => {
      if (iss.kind === 'substitute') return `«${iss.got}» → «${iss.expected}»`;
      if (iss.kind === 'missing') return `es fehlt «${iss.expected}»`;
      return '';
    }).filter(Boolean).join(', ');
    const count = umlautIssues.length;
    if (count >= 2) return `Nein. Umlaute sind keine Dekoration. ${pieces}. Schreib es richtig: «${expected}».`;
    return `Fast. Aber der Umlaut zählt: ${pieces}. Korrekt: «${expected}».`;
  }
  if (issues.length === 1) return `Ein Buchstabe daneben. Korrekt: «${expected}».`;
  if (issues.length <= 3) return `Noch nicht ganz — achte auf die Buchstaben. Korrekt: «${expected}».`;
  return `Das war weit weg. Lies es nochmal: «${expected}».`;
}

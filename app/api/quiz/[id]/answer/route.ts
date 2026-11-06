import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addXp, bumpStreak, getDb } from '@/lib/db';
import { advanceMastery } from '@/lib/mastery';

function norm(s: string) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function isCorrect(type: string, answer: string, user: any, data: any, prompt: string): boolean {
  let parsed: any = answer;
  try { parsed = JSON.parse(answer); } catch {}
  if (type === 'matching') {
    const pairs = (parsed?.pairs ?? parsed) || data?.pairs || {};
    if (!user || typeof user !== 'object') return false;
    const keys = Object.keys(pairs);
    return keys.length > 0 && keys.every((k) => norm(String(pairs[k])) === norm(String(user[k])));
  }
  if (type === 'cloze') {
    const expected: string[] = Array.isArray(parsed) ? parsed.map((x: any) => String(x)) : [];
    if (!expected.length || !user || typeof user !== 'object') return false;
    const re = /\[(\d+)\]/g;
    const groups: Record<number, number[]> = {};
    let m: RegExpExecArray | null;
    let occ = 0;
    while ((m = re.exec(prompt || '')) !== null) {
      const n = Number(m[1]);
      (groups[n] ||= []).push(occ++);
    }
    const nums = Object.keys(groups).map(Number).sort((a, b) => a - b);
    if (!nums.length) return false;
    for (const n of nums) {
      const exp = norm(expected[n - 1] ?? '');
      const got = norm(groups[n].map((o) => String(user[String(o)] || '')).join(' '));
      if (!exp || exp !== got) return false;
    }
    return true;
  }
  if (type === 'mcq') {
    const choices: string[] = data?.choices || data?.options || [];
    let correctIdx = typeof data?.correct_index === 'number' ? data.correct_index : -1;
    if (correctIdx < 0) {
      if (typeof parsed === 'number') correctIdx = parsed;
      else if (typeof parsed === 'string') {
        const n = Number(parsed);
        if (Number.isInteger(n)) correctIdx = n;
        else {
          const idx = choices.findIndex((c) => c === parsed);
          if (idx >= 0) correctIdx = idx;
        }
      }
    }
    if (typeof user === 'number') return user === correctIdx;
    // Also allow text answers (accept value matches correct choice or stored answer)
    const accepted = new Set<string>();
    if (correctIdx >= 0 && choices[correctIdx]) accepted.add(norm(choices[correctIdx]));
    if (Array.isArray(parsed)) parsed.forEach((a: string) => accepted.add(norm(String(a))));
    else accepted.add(norm(String(parsed)));
    return accepted.has(norm(String(user ?? '')));
  }
  const accepted = Array.isArray(parsed) ? parsed.map((a: string) => norm(a)) : [norm(String(parsed))];
  const extra = Array.isArray(data?.accepted_answers) ? data.accepted_answers.map((a: string) => norm(a)) : [];
  return [...accepted, ...extra].includes(norm(String(user ?? '')));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: quizId } = await ctx.params;
  const { results, review_mode } = await req.json();
  if (!Array.isArray(results)) return NextResponse.json({ error: 'results required' }, { status: 400 });
  const db = getDb();
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId) as any;
  if (!quiz) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const getQ = db.prepare('SELECT * FROM questions WHERE id = ? AND quiz_id = ?');
  const insertA = db.prepare('INSERT INTO answers(question_id, quiz_id, user_answer, correct, answered_at) VALUES(?, ?, ?, ?, ?)');
  const getMastery = db.prepare('SELECT ease, interval_days, repetitions, attempts, correct_streak, lapses FROM question_mastery WHERE question_id = ?');
  const saveMastery = db.prepare(`INSERT INTO question_mastery(
    question_id, quiz_id, ease, interval_days, repetitions, due_at, attempts, correct_streak, lapses, last_correct, last_answered_at
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(question_id) DO UPDATE SET
    ease = excluded.ease, interval_days = excluded.interval_days, repetitions = excluded.repetitions,
    due_at = excluded.due_at, attempts = excluded.attempts, correct_streak = excluded.correct_streak,
    lapses = excluded.lapses, last_correct = excluded.last_correct, last_answered_at = excluded.last_answered_at`);
  let correctCount = 0;
  const details: any[] = [];
  const tx = db.transaction(() => {
    for (const r of results) {
      const q = getQ.get(r.question_id, quizId) as any;
      if (!q) continue;
      let qdata: any = {};
      try { qdata = JSON.parse(q.data); } catch {}
      const ok = isCorrect(q.type, q.answer, r.user_answer, qdata, q.prompt || '');
      insertA.run(q.id, quizId, typeof r.user_answer === 'string' ? r.user_answer : JSON.stringify(r.user_answer), ok ? 1 : 0, Date.now());
      const prior = getMastery.get(q.id) as any;
      const next = advanceMastery(prior, ok);
      saveMastery.run(q.id, Number(quizId), next.ease, next.interval_days, next.repetitions,
        next.due_at, next.attempts, next.correct_streak, next.lapses, next.last_correct, next.last_answered_at);
      if (ok) correctCount += 1;
      details.push({ question_id: q.id, correct: ok, answer: q.answer, explanation: q.explanation });
    }
    const xp = correctCount * (review_mode ? 4 : 10);
    db.prepare('UPDATE quizzes SET completed = 1, xp_earned = xp_earned + ? WHERE id = ?').run(xp, quizId);
    addXp(xp);
    if (correctCount > 0) bumpStreak();
    return xp;
  });
  const xpEarned = tx();
  const mastery = db.prepare(`SELECT
    COUNT(*) AS attempted,
    SUM(CASE WHEN correct_streak >= 3 THEN 1 ELSE 0 END) AS mastered,
    MIN(due_at) AS next_review_at
    FROM question_mastery WHERE quiz_id = ?`).get(quizId) as any;
  return NextResponse.json({
    correct: correctCount,
    total: results.length,
    xp: xpEarned,
    details,
    mastery: {
      attempted: Number(mastery?.attempted || 0),
      mastered: Number(mastery?.mastered || 0),
      next_review_at: mastery?.next_review_at || null,
    },
  });
}

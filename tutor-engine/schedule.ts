import type { EvidenceKind, Review } from './types';

const DAY = 86_400_000;
export function scheduleReview(previous: Review | undefined, objectiveId: string, evidenceKind: EvidenceKind, correct: boolean, now: number, assisted = false): Review {
  const base = previous ?? { objectiveId, evidenceKind, dueAt: now, intervalDays: 0, ease: 2.5, successes: 0, lapses: 0, lastAt: 0 };
  const independent = correct && !assisted;
  const successes = independent ? base.successes + 1 : 0;
  const lapses = base.lapses + (independent ? 0 : 1);
  // SM-2 baseline until enough actual history exists to calibrate FSRS.
  const intervalDays = independent ? (successes === 1 ? 1 : successes === 2 ? 3 : Math.max(4, Math.round(base.intervalDays * base.ease))) : 0.04;
  const ease = Math.max(1.3, Math.min(3.0, base.ease + (independent ? 0.05 : -0.2)));
  return { objectiveId, evidenceKind, dueAt: now + intervalDays * DAY, intervalDays, ease, successes, lapses, lastAt: now };
}

export function hasDelayedRetention(review: Review | undefined, attempts: { phase: string; correct: boolean | null; assisted: boolean; createdAt: number }[]): boolean {
  if (!review || review.successes < 2) return false;
  const successes = attempts.filter(a => a.phase === 'retention' && a.correct === true && !a.assisted).sort((a,b) => a.createdAt - b.createdAt);
  return successes.length > 0 && successes.some(a => a.createdAt - attempts[0]?.createdAt >= DAY);
}

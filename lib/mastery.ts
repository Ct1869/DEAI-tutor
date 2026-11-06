import { sm2 } from './srs';

export type MasteryState = {
  ease: number;
  interval_days: number;
  repetitions: number;
  attempts: number;
  correct_streak: number;
  lapses: number;
};

export function advanceMastery(prior: Partial<MasteryState> | null | undefined, correct: boolean, now = Date.now()) {
  const scheduled = sm2({
    ease: Number(prior?.ease ?? 2.5),
    interval_days: Number(prior?.interval_days ?? 0),
    repetitions: Number(prior?.repetitions ?? 0),
  }, correct ? 4 : 1);
  return {
    ...scheduled,
    due_at: now + scheduled.interval_days * 86_400_000,
    attempts: Number(prior?.attempts ?? 0) + 1,
    correct_streak: correct ? Number(prior?.correct_streak ?? 0) + 1 : 0,
    lapses: Number(prior?.lapses ?? 0) + (correct ? 0 : 1),
    last_correct: correct ? 1 : 0,
    last_answered_at: now,
  };
}

export function masteryPercent(mastered: number, attempted: number) {
  return attempted > 0 ? Math.round((mastered / attempted) * 100) : 0;
}

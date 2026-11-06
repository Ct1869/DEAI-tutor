// SM-2 spaced repetition. quality: 0=again, 3=hard, 4=good, 5=easy
export type SrsState = { ease: number; interval_days: number; repetitions: number };

export function sm2(state: SrsState, quality: number): SrsState {
  let { ease, interval_days, repetitions } = state;
  if (quality < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 1;
    else if (repetitions === 2) interval_days = 3;
    else interval_days = Math.round(interval_days * ease);
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease < 1.3) ease = 1.3;
  }
  return { ease, interval_days, repetitions };
}

export function nextDueAt(interval_days: number): number {
  return Date.now() + interval_days * 86400000;
}

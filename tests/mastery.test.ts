import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMastery, masteryPercent } from '../lib/mastery';

test('a correct retrieval advances the schedule and recall streak', () => {
  const now = Date.UTC(2026, 6, 19);
  const next = advanceMastery(null, true, now);
  assert.equal(next.repetitions, 1);
  assert.equal(next.interval_days, 1);
  assert.equal(next.correct_streak, 1);
  assert.equal(next.attempts, 1);
  assert.equal(next.due_at, now + 86_400_000);
});

test('a lapse resets the recall streak and increments lapses', () => {
  const next = advanceMastery({ ease: 2.5, interval_days: 6, repetitions: 3, attempts: 4, correct_streak: 3, lapses: 1 }, false, 1000);
  assert.equal(next.repetitions, 0);
  assert.equal(next.interval_days, 1);
  assert.equal(next.correct_streak, 0);
  assert.equal(next.lapses, 2);
  assert.equal(next.attempts, 5);
});

test('mastery percentage is stable for empty and partial histories', () => {
  assert.equal(masteryPercent(0, 0), 0);
  assert.equal(masteryPercent(3, 4), 75);
});

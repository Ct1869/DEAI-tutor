import crypto from 'crypto';
import type { Activity, Attempt, EvidenceKind, Review, Session, Unit } from './types';
import { allActivities, validateCatalog } from './quality';
import { scheduleReview } from './schedule';
import type { TutorProvider } from './provider';

export type LearningState = { attempts: Attempt[]; reviews: Review[] };
export type StepResult = { session: Session; activity: Activity | null; feedback: string; attempt?: Attempt; report?: ReturnType<typeof sessionReport> };
const phaseOrder = ['diagnostic','teach','guided','recall','application','writing','speaking'] as const;
const DAY = 86_400_000;
const norm = (text: string) => text.normalize('NFC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

export function buildSession(unit: Unit, state: LearningState, budgetMinutes: number, now = Date.now(), catalog: Unit[] = [unit]): Session {
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('; '));
  const budget = [15,30,45,60].includes(budgetMinutes) ? budgetMinutes : 30;
  const queue: string[] = [];
  const seen = new Set<string>();
  let seconds = 0;
  // Reviews and weak concepts from any imported, verified unit go first.
  for (const review of [...state.reviews].filter(r => r.dueAt <= now).sort((a,b) => a.dueAt - b.dueAt)) {
    const objective = catalog.flatMap(u => u.objectives).find(o => o.id === review.objectiveId);
    const model = objective?.activities.find(a => a.phase === 'retention');
    if (!model || seen.has(objective!.id)) continue;
    if (seconds + model.estimatedSeconds > budget * 60 * 0.4 && queue.length) break;
    const id = model.id;
    queue.push(id); seen.add(objective!.id); seconds += model.estimatedSeconds;
  }
  for (const objective of unit.objectives) {
    const attempts = state.attempts.filter(a => a.objectiveId === objective.id);
    for (const phase of phaseOrder) {
      const activity = objective.activities.find(a => a.phase === phase);
      if (!activity) continue;
      if (attempts.some(a => a.activityId === activity.id && (a.correct === true || a.correct === null))) continue;
      if (seconds + activity.estimatedSeconds > budget * 60) break;
      queue.push(activity.id); seconds += activity.estimatedSeconds;
    }
    if (seconds >= budget * 60 - 75) break;
  }
  // A completed first pass is never the end of learning: due reviews remain.
  return { id: crypto.randomUUID(), unitId: unit.id, budgetMinutes: budget, startedAt: now, queue, completed: [], currentActivityId: queue[0] };
}

export function findActivity(unit: Unit | Unit[], id?: string): Activity | null {
  if (!id) return null;
  const actual = (Array.isArray(unit) ? unit : [unit]).flatMap(allActivities).find(a => a.id === id);
  if (!actual) return null;
  return actual;
}

function kind(phase: Activity['phase']): EvidenceKind | null {
  if (phase === 'diagnostic' || phase === 'recall') return 'recall';
  if (phase === 'guided' || phase === 'teach') return 'recognition';
  if (phase === 'application') return 'application';
  if (phase === 'writing') return 'writing';
  if (phase === 'speaking') return 'speaking';
  if (phase === 'retention') return 'retention';
  return null;
}

export async function respond(unit: Unit, session: Session, state: LearningState, response: string, assisted: boolean, provider?: TutorProvider, now = Date.now(), catalog: Unit[] = [unit]): Promise<{ result: StepResult; state: LearningState }> {
  const activity = findActivity(catalog, session.currentActivityId);
  if (!activity) throw new Error('No active activity');
  if (!response.trim()) throw new Error('Write or speak an answer before continuing.');
  const sourceUnit = catalog.find(u => u.objectives.some(o => o.id === activity.objectiveId))!;
  const objective = sourceUnit.objectives.find(o => o.id === activity.objectiveId)!;
  let correct: boolean | null = null;
  let grading: Attempt['grading'] = 'pending';
  let confidence = 0;
  let feedback = 'Saved. An open response needs an AI tutor or a human review before it can count as demonstrated mastery.';
  if (activity.expected?.length) {
    correct = activity.expected.some(x => norm(x) === norm(response));
    grading = 'exact'; confidence = correct ? 1 : 0.8;
    feedback = correct ? (assisted ? 'Correct with help. We will test this independently later.' : 'Correct. The tutor will check it again in a new context.') : `That does not match the reviewed answer. ${activity.explanation || objective.rule}`;
  } else if (provider && await provider.available()) {
    try {
      const judgment = await provider.assess({ rule: objective.rule, instruction: activity.instruction, response, rubric: activity.rubric, context: `Unit ${unit.title}, ${activity.phase}. Do not judge pronunciation from transcript.` });
      if (judgment.confidence >= 0.8 && typeof judgment.correct === 'boolean') {
        correct = judgment.correct; grading = 'model'; confidence = judgment.confidence;
      }
      feedback = judgment.feedback || feedback;
    } catch { /* Honest pending state if a local model fails. */ }
  }
  const attempt: Attempt = { sessionId: session.id, unitId: sourceUnit.id, objectiveId: activity.objectiveId, activityId: activity.id, phase: activity.phase, response: response.trim(), correct, assisted, feedback, grading, confidence, createdAt: now };
  const nextState: LearningState = { attempts: [...state.attempts, attempt], reviews: [...state.reviews] };
  const evidence = kind(activity.phase);
  if (evidence && correct !== null && (activity.phase === 'recall' || activity.phase === 'application' || activity.phase === 'writing' || activity.phase === 'speaking' || activity.phase === 'retention')) {
    const index = nextState.reviews.findIndex(r => r.objectiveId === objective.id && r.evidenceKind === evidence);
    const next = scheduleReview(index < 0 ? undefined : nextState.reviews[index], objective.id, evidence, correct, now, assisted);
    if (index < 0) nextState.reviews.push(next); else nextState.reviews[index] = next;
    if (activity.phase === 'retention') {
      for (let i = 0; i < nextState.reviews.length; i++) {
        const due = nextState.reviews[i];
        if (due.objectiveId === objective.id && due.evidenceKind !== 'retention' && due.dueAt <= now) {
          nextState.reviews[i] = scheduleReview(due, objective.id, due.evidenceKind, correct, now, assisted);
        }
      }
    }
  }
  const queue = session.queue.slice(1);
  if (correct === false && !assisted && activity.phase !== 'teach') {
    const teaching = objective.activities.find(a => a.phase === 'teach');
    const guided = objective.activities.find(a => a.phase === 'guided');
    // A changed intervention, with a bounded retry, avoids identical-question loops.
    const priorFailures = nextState.attempts.filter(a => a.objectiveId === objective.id && a.correct === false).length;
    if (priorFailures <= 2) {
      const next = priorFailures === 1 ? teaching : guided;
      if (next && !queue.includes(next.id)) queue.unshift(next.id);
    }
  }
  const nextSession: Session = { ...session, queue, completed: [...session.completed, activity.id], currentActivityId: queue[0], feedback,
    ...(queue.length ? {} : { endedAt: now }) };
  const report = queue.length ? undefined : sessionReport(unit, nextState, nextSession, now);
  return { result: { session: nextSession, activity: findActivity(catalog, queue[0]), feedback, attempt, report }, state: nextState };
}

export function sessionReport(unit: Unit, state: LearningState, session: Session, now = Date.now()) {
  const attempts = state.attempts.filter(a => a.sessionId === session.id);
  const independent = attempts.filter(a => a.correct === true && !a.assisted && ['diagnostic','recall','application','writing','speaking','retention'].includes(a.phase));
  const due = state.reviews.filter(r => r.dueAt <= now).length;
  const retained = new Set(state.attempts.filter(a => a.phase === 'retention' && a.correct === true && !a.assisted && state.attempts.some(prior => prior.objectiveId === a.objectiveId && prior.phase === 'recall' && prior.correct === true && !prior.assisted && a.createdAt - prior.createdAt >= DAY)).map(a => a.objectiveId));
  return {
    studied: [...new Set(attempts.map(a => unit.objectives.find(o => o.id === a.objectiveId)?.title || a.objectiveId))],
    attempted: attempts.length, independentlyCorrect: independent.length,
    applicationCorrect: independent.filter(a => ['application','writing','speaking'].includes(a.phase)).length,
    uncertain: attempts.filter(a => a.correct === null).length,
    needsWork: [...new Set(attempts.filter(a => a.correct !== true || a.assisted).map(a => a.objectiveId))],
    dueReviews: due, retainedObjectives: retained.size,
    textbookCoverage: { verifiedPages: unit.bookPages.length, unitPages: unit.bookPages.length, totalBookPages: unit.totalBookPages },
    practiceCompletion: { completed: session.completed.length, assigned: session.completed.length + session.queue.length },
    demonstratedMastery: { objectives: unit.objectives.filter(o => {
      const events = state.attempts.filter(a => a.objectiveId === o.id);
      const lastRetention = events.filter(a => a.phase === 'retention').at(-1);
      return lastRetention?.correct !== false && events.some(a => a.phase === 'recall' && a.correct === true && !a.assisted) && events.some(a => ['application','writing','speaking'].includes(a.phase) && a.correct === true && !a.assisted);
    }).length, total: unit.objectives.length },
    retention: { passed: retained.size, total: unit.objectives.length },
    next: due ? 'Revisit due and weak concepts before new material.' : 'Continue with the next objective and a fresh-context check.',
  };
}

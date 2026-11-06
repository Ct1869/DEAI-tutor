import crypto from 'crypto';
import { readFileSync } from 'fs';
import type { Activity, Unit } from './types';

export function sha256(path: string): string { return crypto.createHash('sha256').update(readFileSync(path)).digest('hex'); }

export function validateUnit(unit: Unit): string[] {
  const errors: string[] = [];
  if (!unit.id || !unit.title || unit.reviewStatus !== 'source-reviewed') errors.push('unit is not source reviewed');
  if (!/^[a-f0-9]{64}$/.test(unit.sourceHash) || !/^[a-f0-9]{64}$/.test(unit.answerHash)) errors.push('source hashes missing');
  if (!Number.isInteger(unit.totalBookPages) || unit.totalBookPages < Math.max(...unit.bookPages)) errors.push('invalid total book page count');
  if (!unit.bookPages.length || !unit.answerPages.length) errors.push('page inventory missing');
  if (!unit.expectedExercises?.length) errors.push('exercise inventory missing');
  const objectiveIds = new Set<string>();
  const activityIds = new Set<string>();
  for (const objective of unit.objectives) {
    if (objectiveIds.has(objective.id)) errors.push(`duplicate objective ${objective.id}`);
    objectiveIds.add(objective.id);
    if (!objective.source.length || !objective.activities.length) errors.push(`${objective.id}: missing references or activities`);
    for (const activity of objective.activities) {
      if (activityIds.has(activity.id)) errors.push(`duplicate activity ${activity.id}`);
      activityIds.add(activity.id);
      if (activity.objectiveId !== objective.id) errors.push(`${activity.id}: wrong objective`);
      if (!unit.bookPages.includes(activity.source.bookPdfPage)) errors.push(`${activity.id}: source page outside unit`);
      if (activity.source.answerPdfPage && !unit.answerPages.includes(activity.source.answerPdfPage)) errors.push(`${activity.id}: answer page outside unit`);
      if (activity.source.status === 'unmapped' && activity.expected?.length) errors.push(`${activity.id}: unmapped source has a graded answer`);
      if (activity.expected?.some(x => !x.trim())) errors.push(`${activity.id}: blank expected answer`);
    }
  }
  for (const objective of unit.objectives) for (const dependency of objective.prerequisites) {
    if (!objectiveIds.has(dependency)) errors.push(`${objective.id}: unknown dependency ${dependency}`);
  }
  const coveredExercises = new Set(unit.objectives.flatMap(o => [...o.source, ...o.activities.map(a => a.source)]).map(r => r.exercise).filter((x): x is number => x != null));
  for (const exercise of unit.expectedExercises || []) if (!coveredExercises.has(exercise)) errors.push(`exercise ${exercise} has no objective or activity`);
  return errors;
}

export function verifyFiles(unit: Unit, bookPath: string, answerPath: string): string[] {
  const errors = validateUnit(unit);
  for (const [label, filePath, expected] of [
    ['book', bookPath, unit.sourceHash],
    ['answer', answerPath, unit.answerHash],
  ]) {
    try {
      if (sha256(filePath) !== expected) errors.push(`${label} checksum changed`);
    } catch (error: any) {
      if (error?.code === 'ENOENT') errors.push(`${label} PDF missing`);
      else throw error;
    }
  }
  return errors;
}

export function allActivities(unit: Unit): Activity[] { return unit.objectives.flatMap(o => o.activities); }

export function validateCatalog(units: Unit[]): string[] {
  const errors = units.flatMap(u => validateUnit(u).map(x => `${u.id}: ${x}`));
  const objectiveIds = new Set<string>(), activityIds = new Set<string>();
  for (const unit of units) {
    for (const objective of unit.objectives) {
      if (objectiveIds.has(objective.id)) errors.push(`objective ID collision: ${objective.id}`);
      objectiveIds.add(objective.id);
      for (const activity of objective.activities) {
        if (activityIds.has(activity.id)) errors.push(`activity ID collision: ${activity.id}`);
        activityIds.add(activity.id);
      }
    }
  }
  return errors;
}

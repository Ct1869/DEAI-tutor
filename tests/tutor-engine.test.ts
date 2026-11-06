import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { unit1 } from '../tutor-content/unit1';
import { buildSession, findActivity, respond, sessionReport, type LearningState } from '../tutor-engine/engine';
import { validateUnit, verifyFiles } from '../tutor-engine/quality';
import { checkDraft, ingestUnit, type PageEvidence } from '../tutor-engine/ingestion';
import { openTutorDb, saveSession, getSession, saveResponse, getLearningState } from '../tutor-engine/store';

const empty = (): LearningState => ({ attempts: [], reviews: [] });
const day = 86_400_000;
const now = 1_800_000_000_000;
const bookPath = path.join(process.cwd(),'private/books/4/book.pdf');
const answerPath = path.join(process.cwd(),'private/books/4/answers.pdf');
const hasPrivateSources = existsSync(bookPath) && existsSync(answerPath);

test('verified Unit 1 uses only the original PDF checksums and exact page inventory', () => {
  assert.deepEqual(validateUnit(unit1), []);
  if (hasPrivateSources) assert.deepEqual(verifyFiles(unit1, bookPath, answerPath), []);
  assert.deepEqual(unit1.bookPages, [11,12,13,14]);
  assert.deepEqual(unit1.answerPages, [1,2]);
  assert.equal(unit1.objectives.length, 6);
});

test('tutor gives one diagnostic task, records assistance, and changes approach after an error', async () => {
  const state = empty();
  let session = buildSession(unit1, state, 15, now);
  assert.equal(findActivity(unit1, session.currentActivityId)?.id, 'v2-diagnostic');
  let step = await respond(unit1, session, state, 'Heute ich gehe ins Schwimmbad.', false, undefined, now+1);
  assert.equal(step.result.attempt?.correct, false);
  assert.equal(step.result.activity?.phase, 'teach');
  session = step.result.session;
  step = await respond(unit1, session, step.state, 'Heute gehe ich ins Schwimmbad.', true, undefined, now+2);
  assert.equal(step.result.attempt?.assisted, true);
  assert.equal(step.state.reviews.length, 0);
});

test('independent recall schedules delayed review; failure reopens it', async () => {
  const state = empty();
  const session = { ...buildSession(unit1,state,15,now), queue: ['v2-recall'], currentActivityId: 'v2-recall' };
  const first = await respond(unit1, session, state, 'Morgen lerne ich für die Prüfung.', false, undefined, now);
  assert.equal(first.state.reviews[0].dueAt, now + day);
  const nextSession = buildSession(unit1, first.state, 15, now+day+1);
  assert.equal(nextSession.currentActivityId, 'v2-retain');
  const failed = await respond(unit1, nextSession, first.state, 'Am Freitag ich gehe zum Zahnarzt.', false, undefined, now+day+2);
  assert.equal(failed.result.attempt?.correct, false);
  assert.ok(failed.state.reviews.some(r => r.objectiveId === 'finite-v2' && r.lapses > 0));
  const report = sessionReport(unit1, failed.state, failed.result.session, now+day+2);
  assert.equal(report.retention.passed, 0);
});

test('free writing is retained as uncertain without a model', async () => {
  const state = empty();
  const session = { ...buildSession(unit1,state,30,now), queue: ['front-writing'], currentActivityId: 'front-writing' };
  const step = await respond(unit1, session, state, 'Morgen komme ich. Wenn ich Zeit habe, rufe ich Sie an.', false, undefined, now);
  assert.equal(step.result.attempt?.correct, null);
  assert.equal(step.result.attempt?.grading, 'pending');
  assert.equal(step.result.report?.uncertain, 1);
  assert.equal(step.result.report?.demonstratedMastery.objectives, 0);
});

test('pilot state persists in an isolated database', async () => {
  const db = openTutorDb(':memory:');
  const state = empty();
  const session = { ...buildSession(unit1,state,15,now), queue: ['v2-recall'], currentActivityId: 'v2-recall' };
  saveSession(db,'student',session);
  const step = await respond(unit1,session,state,'Morgen lerne ich für die Prüfung.',false,undefined,now);
  saveResponse(db,'student',step.result.session,step.result.attempt!,step.state.reviews);
  assert.equal(getSession(db,'student',session.id)?.endedAt,now);
  assert.equal(getLearningState(db,'student').attempts.length,1);
  assert.equal(getLearningState(db,'student').reviews.length,1);
  db.close();
});

test('missing private source files are reported without crashing', () => {
  if (hasPrivateSources) return;
  const errors = verifyFiles(unit1, bookPath, answerPath);
  assert.ok(errors.includes('book PDF missing'));
  assert.ok(errors.includes('answer PDF missing'));
});

test('scanned original pages block automatic extraction without OCR or reviewed text', { skip: !hasPrivateSources }, async () => {
  const result = await ingestUnit({ title:'Unit 1', bookPath, answerPath, bookPages:[11], answerPages:[1] });
  assert.equal(result.status,'blocked');
  assert.ok(result.warnings.some(w => w.includes('OCR')));
});

test('same draft validator accepts a synthetic second-unit shape without processing textbook Unit 2', () => {
  const bookPage: PageEvidence = { pdfPage:101, text:'1. Example exercise', textMethod:'reviewed', warnings:[] };
  const answerPage: PageEvidence = { pdfPage:5, text:'1. Example answer', textMethod:'reviewed', warnings:[] };
  const ref = {bookPdfPage:101,printedPage:100,exercise:1,answerPdfPage:5,answerPrintedPage:270,status:'verified'};
  const proposed = { id:'synthetic-unit',title:'Synthetic unit',totalBookPages:120,bookPages:[101],answerPages:[5],expectedExercises:[1],objectives:[{id:'synthetic-objective',title:'Rule',rule:'A test rule',prerequisites:[],source:[ref],required:['recall','retention'],activities:[{id:'synthetic-diagnostic',objectiveId:'synthetic-objective',phase:'diagnostic',instruction:'Write a fresh sentence.',source:ref,responseMode:'text',estimatedSeconds:60}]}]};
  const result = checkDraft(proposed,[bookPage],[answerPage],'a'.repeat(64),'b'.repeat(64));
  assert.deepEqual(result.warnings,[]);
  assert.equal(result.draft?.reviewStatus,'needs-review');
});

test('wrong answer-key mapping cannot publish as verified', () => {
  const invalid = structuredClone(unit1);
  invalid.objectives[0].activities[0].source.status='unmapped';
  assert.ok(validateUnit(invalid).some(x => x.includes('unmapped')));
});

test('cumulative planner places a due objective from a previous unit before new material', () => {
  const previous = structuredClone(unit1);
  previous.id = 'previous-unit';
  previous.objectives = previous.objectives.slice(0,1);
  previous.expectedExercises = [1];
  previous.objectives[0].id = 'previous-finite-v2';
  for (const a of previous.objectives[0].activities) { a.id = `previous-${a.id}`; a.objectiveId = 'previous-finite-v2'; }
  const state = empty();
  state.reviews.push({ objectiveId:'previous-finite-v2', evidenceKind:'recall', dueAt:now-1, intervalDays:1, ease:2.5, successes:1, lapses:0, lastAt:now-day });
  const session = buildSession(unit1,state,15,now,[previous,unit1]);
  assert.equal(session.currentActivityId,'previous-v2-retain');
  assert.equal(findActivity([previous,unit1],session.currentActivityId)?.phase,'retention');
});

test('complete guided session advances one response at a time and keeps four progress measures separate', async () => {
  let state = empty();
  let session = buildSession(unit1,state,30,now);
  let report: ReturnType<typeof sessionReport> | undefined;
  let steps = 0;
  while (session.currentActivityId) {
    const current = findActivity(unit1,session.currentActivityId)!;
    const result = await respond(unit1,session,state,current.expected?.[0] || 'Ich erkläre die Regel und gebe ein eigenes Beispiel.',false,undefined,now + ++steps);
    assert.equal(result.result.attempt?.activityId,current.id);
    state = result.state; session = result.result.session; report = result.result.report;
    assert.ok(steps < 50,'session must terminate');
  }
  assert.ok(report);
  assert.equal(report!.attempted,steps);
  assert.equal(report!.textbookCoverage.verifiedPages,4);
  assert.equal(report!.practiceCompletion.completed,steps);
  assert.equal(report!.retention.passed,0);
  assert.ok(report!.uncertain > 0,'open responses must remain uncertain without AI');
});

test('low-confidence AI grading cannot promote an open response', async () => {
  const state = empty();
  const session = { ...buildSession(unit1,state,30,now), queue:['front-writing'], currentActivityId:'front-writing' };
  const provider = { name:'test-double', available:async()=>true, assess:async()=>({correct:true,confidence:0.45,feedback:'The answer may be acceptable.'}) };
  const step = await respond(unit1,session,state,'Morgen komme ich.',false,provider,now);
  assert.equal(step.result.attempt?.correct,null);
  assert.equal(step.result.attempt?.grading,'pending');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuizPayload } from '../lib/quiz-schema';

const validBookQuiz = {
  title: 'Lektion 1 · Test',
  source: 'Testbuch, S. 10–11',
  book_id: 4,
  lesson_number: 1,
  slug: 'l1-test',
  pdf_page_start: 11,
  pdf_page_end: 12,
  printed_page_start: 10,
  printed_page_end: 11,
  questions: [{
    type: 'mcq',
    prompt: 'Welche Form passt?',
    data: { options: ['wäre', 'war'] },
    answer: 0,
    explanation: 'Hier steht der Konjunktiv II.',
    source_ref: 'S. 10, Regelkasten',
  }],
};

test('accepts a traceable, well-formed book quiz', () => {
  const result = validateQuizPayload(validBookQuiz);
  assert.equal(result.validation.ok, true);
  assert.equal(result.data?.questions[0].answer, 0);
});

test('rejects book questions without a source reference', () => {
  const quiz = structuredClone(validBookQuiz);
  delete (quiz.questions[0] as any).source_ref;
  const result = validateQuizPayload(quiz);
  assert.equal(result.validation.ok, false);
  assert.ok(result.validation.errors.some((issue) => issue.path.includes('source_ref')));
});

test('rejects an mcq answer outside its option list', () => {
  const quiz = structuredClone(validBookQuiz);
  quiz.questions[0].answer = 5;
  const result = validateQuizPayload(quiz);
  assert.equal(result.validation.ok, false);
  assert.ok(result.validation.errors.some((issue) => issue.message.includes('outside')));
});

test('allows standalone quizzes without book traceability fields', () => {
  const result = validateQuizPayload({
    title: 'Freies Vokabelquiz',
    questions: [{
      type: 'typing', prompt: 'Wie heißt library auf Deutsch?', data: {}, answer: ['Bibliothek'], explanation: 'Das Substantiv ist feminin.',
    }],
  });
  assert.equal(result.validation.ok, true);
});

test('rejects numeric matching maps that the quiz UI cannot render', () => {
  const quiz: any = structuredClone(validBookQuiz);
  quiz.questions[0] = {
    type: 'matching', prompt: 'Ordne zu.', data: { left: ['der', 'die'], right: ['Hund', 'Katze'] },
    answer: { '0': '0', '1': '1' }, explanation: 'Artikel und Nomen stimmen überein.', source_ref: 'S. 10, Übung 1',
  };
  const result = validateQuizPayload(quiz);
  assert.equal(result.validation.ok, false);
  assert.ok(result.validation.errors.some((issue) => issue.message.includes('left-hand text')));
});

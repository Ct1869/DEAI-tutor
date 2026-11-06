import { z } from 'zod';

export const QUESTION_TYPES = ['mcq', 'fill_blank', 'translation', 'matching', 'listening', 'typing', 'cloze'] as const;

const answerSchema = z.union([
  z.string().min(1).max(2000),
  z.number().int().nonnegative(),
  z.array(z.string().min(1).max(1000)).min(1).max(30),
  z.record(z.string(), z.string()),
]);

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().trim().min(2).max(4000),
  data: z.record(z.string(), z.unknown()).default({}),
  answer: answerSchema,
  explanation: z.string().trim().min(2).max(2500),
  audio_text: z.string().trim().min(1).max(2000).optional().nullable(),
  source_ref: z.string().trim().min(2).max(300).optional().nullable(),
}).strict().superRefine((question, ctx) => {
  if (question.type === 'mcq') {
    const options = Array.isArray(question.data.options)
      ? question.data.options
      : Array.isArray(question.data.choices) ? question.data.choices : null;
    if (!options || options.length < 2 || options.length > 8 || options.some((option) => typeof option !== 'string' || !option.trim())) {
      ctx.addIssue({ code: 'custom', path: ['data', 'options'], message: 'mcq requires 2–8 non-empty options' });
    }
    if (typeof question.answer !== 'number' || !Number.isInteger(question.answer)) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'mcq answer must be a zero-based option index' });
    } else if (options && question.answer >= options.length) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'mcq answer index is outside the options array' });
    }
  }

  if (question.type === 'matching') {
    const left = question.data.left;
    const right = question.data.right;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length < 2 || left.length !== right.length) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: 'matching requires equally sized left/right arrays with at least two items' });
    }
    if (!question.answer || typeof question.answer !== 'object' || Array.isArray(question.answer)) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'matching answer must be a left-to-right object map' });
    } else if (Array.isArray(left) && Array.isArray(right)) {
      const answer = question.answer as Record<string, string>;
      const missing = left.some((item) => typeof item !== 'string' || !right.includes(answer[item]));
      if (missing) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'matching answer must map every left-hand text to one right-hand text' });
    }
  }

  if (question.type === 'listening' && !question.audio_text) {
    ctx.addIssue({ code: 'custom', path: ['audio_text'], message: 'listening requires audio_text' });
  }

  if (question.type === 'cloze' && !/\[\d+\]/.test(question.prompt)) {
    ctx.addIssue({ code: 'custom', path: ['prompt'], message: 'cloze prompt requires numbered blanks such as [1]' });
  }
});

const nullablePage = z.number().int().positive().nullable().optional();

export const quizPayloadSchema = z.object({
  title: z.string().trim().min(2).max(200),
  source: z.string().trim().min(2).max(500).nullable().optional(),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  book_id: z.number().int().positive().nullable().optional(),
  lesson_number: z.number().int().positive().nullable().optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).nullable().optional(),
  pdf_page_start: nullablePage,
  pdf_page_end: nullablePage,
  printed_page_start: nullablePage,
  printed_page_end: nullablePage,
  questions: z.array(questionSchema).min(1).max(30),
}).strict().superRefine((quiz, ctx) => {
  const ranges: Array<[keyof typeof quiz, keyof typeof quiz]> = [
    ['pdf_page_start', 'pdf_page_end'],
    ['printed_page_start', 'printed_page_end'],
  ];
  for (const [startKey, endKey] of ranges) {
    const start = quiz[startKey] as number | null | undefined;
    const end = quiz[endKey] as number | null | undefined;
    if ((start == null) !== (end == null)) {
      ctx.addIssue({ code: 'custom', path: [startKey], message: `${String(startKey)} and ${String(endKey)} must be provided together` });
    } else if (start != null && end != null && end < start) {
      ctx.addIssue({ code: 'custom', path: [endKey], message: `${String(endKey)} must be greater than or equal to ${String(startKey)}` });
    }
  }

  if (quiz.book_id != null) {
    if (quiz.lesson_number == null) {
      ctx.addIssue({ code: 'custom', path: ['lesson_number'], message: 'book quizzes require lesson_number' });
    }
    quiz.questions.forEach((question, index) => {
      if (!question.source_ref) {
        ctx.addIssue({ code: 'custom', path: ['questions', index, 'source_ref'], message: 'book questions require source_ref' });
      }
    });
  }
});

export type QuizPayload = z.infer<typeof quizPayloadSchema>;

export type QuizValidation = {
  ok: boolean;
  errors: Array<{ path: string; message: string }>;
};

export function validateQuizPayload(input: unknown): { validation: QuizValidation; data?: QuizPayload } {
  const parsed = quizPayloadSchema.safeParse(input);
  if (parsed.success) return { validation: { ok: true, errors: [] }, data: parsed.data };
  return {
    validation: {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  };
}

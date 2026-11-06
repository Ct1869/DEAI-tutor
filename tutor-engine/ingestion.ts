import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import type { Activity, Objective, Unit } from './types';
import { sha256, validateUnit } from './quality';

const run = promisify(execFile);
export type PageEvidence = { pdfPage: number; text: string; textMethod: 'embedded' | 'ocr' | 'reviewed'; imageBytes?: Buffer; warnings: string[] };
export type IngestionResult = { status: 'blocked' | 'review-required' | 'ready'; warnings: string[]; pages: PageEvidence[]; bookHash: string; answerHash: string; draft?: Unit };
export interface SourceAnalysisProvider {
  name: string;
  analyze(args: { title: string; bookPages: PageEvidence[]; answerPages: PageEvidence[] }): Promise<unknown>;
}
export interface OcrProvider { name: string; recognize(png: Buffer, language: string): Promise<string>; }

export class TesseractOcrProvider implements OcrProvider {
  name = 'tesseract-local';
  async recognize(png: Buffer, language = 'deu'): Promise<string> {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'tutor-ocr-'));
    try {
      const input = path.join(tmp, 'page.png');
      const { writeFile } = await import('fs/promises');
      await writeFile(input, png);
      const { stdout } = await run('tesseract', [input, 'stdout', '-l', language, '--psm', '3'], { maxBuffer: 4_000_000, timeout: 40_000 });
      return stdout.trim();
    } finally { await rm(tmp, { recursive: true, force: true }); }
  }
}

// A source analyzer can be swapped without changing the pipeline. This local
// implementation is opt-in and its output always remains a draft for review.
export class OllamaVisionSourceProvider implements SourceAnalysisProvider {
  name = 'ollama-vision-local';
  constructor(private url: string, private model: string) {}
  async analyze(args: { title: string; bookPages: PageEvidence[]; answerPages: PageEvidence[] }): Promise<unknown> {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(this.url) || !this.model) throw new Error('Local vision provider is not configured');
    const prompt = `Analyze only these original PDF pages for one German textbook unit. Return a JSON object with id, title, bookPages, answerPages, expectedExercises, objectives. Enumerate every exercise number in expectedExercises. Each objective needs id, title, rule, prerequisites, source references, required evidence kinds and activities. Each activity needs id, objectiveId, phase, instruction, optional expected answers, source, responseMode and estimatedSeconds. Use exact PDF page numbers. Mark uncertain answer mappings as unmapped and never provide an expected answer for them. Include diagnostics, teaching, guided practice, independent recall, application, free writing or speaking where suitable, and a new delayed retention prompt. Do not copy long passages. If a page or solution is unclear, report uncertainty rather than inventing it. Book title: ${args.title}. Book PDF pages: ${args.bookPages.map(p => p.pdfPage)}. Answer PDF pages: ${args.answerPages.map(p => p.pdfPage)}. Embedded or reviewed text follows: ${JSON.stringify([...args.bookPages, ...args.answerPages].map(p => ({ pdfPage: p.pdfPage, text: p.text.slice(0,15000) })))}`;
    const images = [...args.bookPages, ...args.answerPages].map(p => p.imageBytes?.toString('base64')).filter(Boolean);
    const response = await fetch(`${this.url.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: this.model, stream: false, format: 'json', messages: [{ role: 'user', content: prompt, images }] }) });
    if (!response.ok) throw new Error(`Local vision provider failed: ${response.status}`);
    const data = await response.json();
    return JSON.parse(String(data?.message?.content || '{}'));
  }
}

const sourceSchema = z.object({ bookPdfPage: z.number().int().positive(), printedPage: z.number().int().positive(), exercise: z.number().int().positive().optional(), item: z.number().int().positive().optional(), answerPdfPage: z.number().int().positive().optional(), answerPrintedPage: z.number().int().positive().optional(), status: z.enum(['verified','example','unmapped']) });
const activitySchema: z.ZodType<Activity> = z.object({ id: z.string().min(1), objectiveId: z.string().min(1), phase: z.enum(['diagnostic','teach','guided','recall','application','writing','speaking','retention']), instruction: z.string().min(8), explanation: z.string().optional(), expected: z.array(z.string()).optional(), rubric: z.string().optional(), source: sourceSchema, responseMode: z.enum(['text','speech']), estimatedSeconds: z.number().positive(), generated: z.boolean().optional() }) as z.ZodType<Activity>;
const objectiveSchema: z.ZodType<Objective> = z.object({ id: z.string().min(1), title: z.string().min(1), rule: z.string().min(1), prerequisites: z.array(z.string()), source: z.array(sourceSchema).min(1), required: z.array(z.enum(['recognition','recall','application','writing','speaking','retention'])), activities: z.array(activitySchema).min(1) }) as z.ZodType<Objective>;
const draftSchema = z.object({ id: z.string().min(1), title: z.string().min(1), totalBookPages: z.number().int().positive(), bookPages: z.array(z.number().int().positive()).min(1), answerPages: z.array(z.number().int().positive()).min(1), expectedExercises: z.array(z.number().int().positive()).min(1), objectives: z.array(objectiveSchema).min(1) });

export function checkDraft(proposed: unknown, bookPages: PageEvidence[], answerPages: PageEvidence[], bookHash: string, answerHash: string): { draft?: Unit; warnings: string[] } {
  const parsed = draftSchema.safeParse(proposed);
  if (!parsed.success) return { warnings: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  const draft: Unit = { ...parsed.data, sourceHash: bookHash, answerHash, reviewStatus: 'needs-review' };
  const warnings: string[] = [];
  if (JSON.stringify(draft.bookPages) !== JSON.stringify(bookPages.map(p => p.pdfPage)) || JSON.stringify(draft.answerPages) !== JSON.stringify(answerPages.map(p => p.pdfPage))) warnings.push('Page inventory mismatch');
  warnings.push(...validateUnit({ ...draft, reviewStatus: 'source-reviewed' }));
  for (const objective of draft.objectives) for (const ref of objective.source) {
    const page = bookPages.find(p => p.pdfPage === ref.bookPdfPage);
    if (ref.exercise && !page?.text.match(new RegExp(`(?:^|\\s)${ref.exercise}(?:\\s|[.:])`, 'm'))) warnings.push(`${objective.id}: exercise ${ref.exercise} label not confirmed in source page text`);
    if (ref.exercise && ref.answerPdfPage) {
      const answer = answerPages.find(p => p.pdfPage === ref.answerPdfPage);
      if (!answer?.text.match(new RegExp(`(?:^|\\s)${ref.exercise}(?:\\s|[.:])`, 'm'))) warnings.push(`${objective.id}: exercise ${ref.exercise} label not confirmed in answer page text`);
    }
  }
  for (const objective of draft.objectives) for (const activity of objective.activities) {
    if (activity.expected?.length && activity.source.status !== 'verified') warnings.push(`${activity.id}: answer key mapping is not verified`);
  }
  return { draft, warnings };
}

export async function pdfPageCount(file: string): Promise<number> {
  const { stdout } = await run('/usr/bin/pdfinfo', [file], { maxBuffer: 2_000_000 });
  const count = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid PDF: ${file}`);
  return count;
}

export async function inspectPage(file: string, pdfPage: number, includeImage = true): Promise<PageEvidence> {
  const count = await pdfPageCount(file);
  if (pdfPage < 1 || pdfPage > count) throw new Error(`Page ${pdfPage} outside PDF`);
  const { stdout } = await run('/usr/bin/pdftotext', ['-f', String(pdfPage), '-l', String(pdfPage), '-layout', file, '-'], { maxBuffer: 4_000_000 });
  const text = stdout.trim();
  let imageBytes: Buffer | undefined;
  if (includeImage) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'tutor-page-'));
    try {
      const out = path.join(tmp, 'page');
      await run('/usr/bin/pdftoppm', ['-f', String(pdfPage), '-l', String(pdfPage), '-scale-to', '1800', '-singlefile', '-png', file, out], { timeout: 30_000 });
      imageBytes = await readFile(`${out}.png`);
    } finally { await rm(tmp, { recursive: true, force: true }); }
  }
  return { pdfPage, text, textMethod: 'embedded', imageBytes, warnings: text.length < 100 ? ['Scanned or unreadable page: OCR or human-reviewed transcription required'] : [] };
}

export async function ingestUnit(args: { title: string; bookPath: string; answerPath: string; bookPages: number[]; answerPages: number[]; provider?: SourceAnalysisProvider; ocr?: OcrProvider; reviewedPages?: Record<string, string> }): Promise<IngestionResult> {
  const bookHash = sha256(args.bookPath), answerHash = sha256(args.answerPath);
  const pages = await Promise.all(args.bookPages.map(n => inspectPage(args.bookPath, n)));
  const answers = await Promise.all(args.answerPages.map(n => inspectPage(args.answerPath, n)));
  const all = [...pages, ...answers];
  for (const page of all) {
    if (page.text.length < 100 && args.ocr && page.imageBytes) {
      try {
        const recognized = await args.ocr.recognize(page.imageBytes, 'deu');
        if (recognized.length >= 100) { page.text = recognized; page.textMethod = 'ocr'; page.warnings = []; }
        else page.warnings.push('OCR produced too little text');
      } catch (error: any) { page.warnings.push(`OCR failed: ${String(error?.message || error)}`); }
    }
    const key = `${pages.includes(page) ? 'book' : 'answers'}:${page.pdfPage}`;
    if (args.reviewedPages?.[key]) { page.text = args.reviewedPages[key]; page.textMethod = 'reviewed'; page.warnings = []; }
  }
  const warnings = all.flatMap(p => p.warnings.map(w => `PDF page ${p.pdfPage}: ${w}`));
  if (warnings.length) return { status: 'blocked', warnings, pages: all, bookHash, answerHash };
  if (!args.provider) return { status: 'review-required', warnings: ['No source analysis provider is configured; a reviewed unit draft is required.'], pages: all, bookHash, answerHash };
  const proposed = await args.provider.analyze({ title: args.title, bookPages: pages, answerPages: answers });
  const checked = checkDraft({ ...(proposed && typeof proposed === 'object' ? proposed : {}), totalBookPages: await pdfPageCount(args.bookPath) }, pages, answers, bookHash, answerHash);
  return { status: checked.warnings.length ? 'blocked' : 'review-required', warnings: checked.warnings.length ? checked.warnings : ['Draft generated. Human source and answer-key verification required before publication.'], pages: all, bookHash, answerHash, draft: checked.draft };
}

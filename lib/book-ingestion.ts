import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb } from './db';
import { activeModel } from './codex';
import { chat, chatWithImages } from './llm';
import { validateQuizPayload, type QuizPayload } from './quiz-schema';

const execFileAsync = promisify(execFile);
const STORAGE_ROOT = path.join(process.cwd(), 'private', 'books');
const MAX_PDF_BYTES = 250 * 1024 * 1024;
const PROMPT_VERSION = 'mastery-loop-v2';

export type SourceKind = 'book' | 'answers';

type BookRow = {
  id: number;
  name: string;
  code: string | null;
  drive_url: string | null;
  answer_key_url: string | null;
  page_offset: number | null;
  total_pdf_pages: number | null;
  printed_page_start: number | null;
  printed_page_end: number | null;
  pages_per_day: number | null;
  notes: string | null;
};

type SectionCandidate = {
  lesson_number: number;
  title: string;
  printed_page_start: number;
  printed_page_end: number;
};

function bookById(bookId: number): BookRow {
  const book = getDb().prepare('SELECT * FROM books WHERE id = ?').get(bookId) as BookRow | undefined;
  if (!book) throw new Error('Book not found.');
  return book;
}

function safeBookDir(bookId: number) {
  if (!Number.isInteger(bookId) || bookId < 1) throw new Error('Invalid book id.');
  return path.join(STORAGE_ROOT, String(bookId));
}

function driveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return match?.[1] || null;
}

function sourceFilename(kind: SourceKind) {
  return kind === 'book' ? 'book.pdf' : 'answers.pdf';
}

function textFilename(kind: SourceKind) {
  return kind === 'book' ? 'book.txt' : 'answers.txt';
}

async function pdfPageCount(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('/usr/bin/pdfinfo', [filePath], { maxBuffer: 2 * 1024 * 1024 });
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error('Could not read PDF page count.');
  return Number(match[1]);
}

async function extractPdf(filePath: string, first?: number, last?: number): Promise<string> {
  const args: string[] = ['-layout'];
  if (first != null) args.push('-f', String(first));
  if (last != null) args.push('-l', String(last));
  args.push(filePath, '-');
  const { stdout } = await execFileAsync('/usr/bin/pdftotext', args, { maxBuffer: 25 * 1024 * 1024 });
  return stdout.replace(/\u0000/g, '').trim();
}

async function renderPdfPages(filePath: string, first: number, last: number, scale = 1650): Promise<Buffer[]> {
  const tempDir = await fs.mkdtemp('/tmp/quiz-pdf-pages-');
  const prefix = path.join(tempDir, 'page');
  try {
    await execFileAsync('/usr/bin/pdftoppm', [
      '-f', String(first), '-l', String(last), '-jpeg', '-jpegopt', 'quality=82',
      '-scale-to', String(scale), filePath, prefix,
    ], { maxBuffer: 2 * 1024 * 1024, timeout: 120_000 });
    const files = (await fs.readdir(tempDir)).filter((name) => name.endsWith('.jpg')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!files.length) throw new Error('Could not render PDF pages for vision processing.');
    return Promise.all(files.map((name) => fs.readFile(path.join(tempDir, name))));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function saveBookPdf(bookId: number, kind: SourceKind, bytes: Buffer) {
  bookById(bookId);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${kind} is not a valid PDF.`);
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF exceeds the 250 MB private upload limit.');

  const dir = safeBookDir(bookId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, sourceFilename(kind));
  const tempPath = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tempPath, bytes, { mode: 0o600 });
  await fs.rename(tempPath, filePath);

  const pages = await pdfPageCount(filePath);
  const textPath = path.join(dir, textFilename(kind));
  const extracted = await extractPdf(filePath);
  await fs.writeFile(textPath, extracted, { mode: 0o600 });
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO book_sources(book_id, kind, filename, storage_path, checksum, page_count, extracted_text_path, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(book_id, kind) DO UPDATE SET
      filename = excluded.filename,
      storage_path = excluded.storage_path,
      checksum = excluded.checksum,
      page_count = excluded.page_count,
      extracted_text_path = excluded.extracted_text_path,
      updated_at = excluded.updated_at
  `).run(bookId, kind, sourceFilename(kind), filePath, checksum, pages, textPath, now, now);

  if (kind === 'book') {
    getDb().prepare('UPDATE books SET total_pdf_pages = COALESCE(total_pdf_pages, ?) WHERE id = ?').run(pages, bookId);
  }
  return { kind, pages, checksum };
}

async function fetchDrivePdf(url: string): Promise<Buffer> {
  const id = driveFileId(url);
  if (!id) throw new Error('Only a Google Drive PDF share link is supported for automatic import.');
  const response = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Google Drive download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error('Google Drive PDF exceeds the 250 MB private import limit.');
  if (bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Google Drive returned a web page instead of a PDF. Make the file readable by anyone with the link or upload it manually.');
  }
  return bytes;
}

export async function importBookDriveSources(bookId: number) {
  const book = bookById(bookId);
  if (!book.drive_url) throw new Error('The book has no Google Drive URL.');
  const imported = [await saveBookPdf(bookId, 'book', await fetchDrivePdf(book.drive_url))];
  if (book.answer_key_url) {
    imported.push(await saveBookPdf(bookId, 'answers', await fetchDrivePdf(book.answer_key_url)));
  }
  return imported;
}

function sourceFor(bookId: number, kind: SourceKind) {
  return getDb().prepare('SELECT * FROM book_sources WHERE book_id = ? AND kind = ?').get(bookId, kind) as any;
}

function parseJsonObject(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI returned no JSON object.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeSections(raw: unknown, book: BookRow): SectionCandidate[] {
  const rows = Array.isArray((raw as any)?.sections) ? (raw as any).sections : [];
  const minPage = book.printed_page_start ?? 1;
  const maxPage = book.printed_page_end ?? Number.MAX_SAFE_INTEGER;
  const seen = new Set<number>();
  const normalized: SectionCandidate[] = [];
  for (const row of rows) {
    const lesson = Number(row?.lesson_number);
    const start = Number(row?.printed_page_start);
    const end = Number(row?.printed_page_end);
    const title = typeof row?.title === 'string' ? row.title.trim().slice(0, 180) : '';
    if (!Number.isInteger(lesson) || lesson < 1 || seen.has(lesson) || !title) continue;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minPage || end > maxPage || end < start) continue;
    seen.add(lesson);
    normalized.push({ lesson_number: lesson, title, printed_page_start: start, printed_page_end: end });
  }
  return normalized.sort((a, b) => a.lesson_number - b.lesson_number);
}

function fallbackSections(book: BookRow): SectionCandidate[] {
  const first = book.printed_page_start ?? 1;
  const last = book.printed_page_end ?? first;
  const size = Math.max(1, book.pages_per_day || 2);
  const sections: SectionCandidate[] = [];
  for (let page = first, lesson = 1; page <= last; page += size, lesson++) {
    sections.push({
      lesson_number: lesson,
      title: `Seiten ${page}–${Math.min(last, page + size - 1)}`,
      printed_page_start: page,
      printed_page_end: Math.min(last, page + size - 1),
    });
  }
  return sections;
}

export async function analyzeBookSections(bookId: number) {
  const book = bookById(bookId);
  const source = sourceFor(bookId, 'book');
  if (!source) throw new Error('Import or upload the book PDF first.');
  const sampleEnd = Math.min(source.page_count || 30, 35);
  const openingText = await extractPdf(source.storage_path, 1, sampleEnd);
  let sections: SectionCandidate[] = [];
  let usedFallback = false;

  try {
    const analysisPrompt = `BOOK METADATA\nTitle: ${book.name}\nPrinted content range: ${book.printed_page_start ?? '?'}–${book.printed_page_end ?? '?'}\nPDF offset (pdf page = printed page + offset): ${book.page_offset ?? 0}\nBook notes: ${book.notes || 'none'}\n\n${openingText.length >= 500 ? `OPENING PAGES / TABLE OF CONTENTS\n${openingText.slice(0, 65_000)}` : 'The following ordered images are PDF pages 1 onward. Read every table-of-contents page in them.'}\n\nReturn JSON only in this exact form:\n{"sections":[{"lesson_number":1,"title":"...","printed_page_start":10,"printed_page_end":11}]}\nInclude every numbered grammar chapter visible in the table of contents, preserve its real chapter number, and use only pages inside the printed content range.`;
    const response = openingText.length >= 500
      ? await chat([{ role: 'user', content: analysisPrompt }], 8_000, 'You extract a textbook table of contents into dependable lesson boundaries. Never invent chapters not supported by the supplied text. Return JSON only.')
      : await chatWithImages(analysisPrompt, (await renderPdfPages(source.storage_path, 1, Math.min(source.page_count || 14, 14), 1400)).map((data) => ({ data, detail: 'high' })), 8_000, 'You extract a textbook table of contents into dependable lesson boundaries. Never invent chapters not supported by the supplied images. Return JSON only.');
    sections = normalizeSections(parseJsonObject(response), book);
  } catch {
    sections = [];
  }

  if (sections.length < 3) {
    sections = fallbackSections(book);
    usedFallback = true;
  }

  const offset = book.page_offset ?? 0;
  const now = Date.now();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM book_sections WHERE book_id = ? AND id NOT IN (SELECT section_id FROM quiz_drafts WHERE section_id IS NOT NULL)').run(bookId);
    const upsert = db.prepare(`
      INSERT INTO book_sections(book_id, lesson_number, title, pdf_page_start, pdf_page_end, printed_page_start, printed_page_end, status, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
      ON CONFLICT(book_id, lesson_number) DO UPDATE SET
        title = excluded.title,
        pdf_page_start = excluded.pdf_page_start,
        pdf_page_end = excluded.pdf_page_end,
        printed_page_start = excluded.printed_page_start,
        printed_page_end = excluded.printed_page_end,
        updated_at = excluded.updated_at
    `);
    for (const section of sections) {
      upsert.run(
        bookId,
        section.lesson_number,
        section.title,
        section.printed_page_start + offset,
        section.printed_page_end + offset,
        section.printed_page_start,
        section.printed_page_end,
        now,
        now,
      );
    }
  });
  tx();
  return { count: sections.length, used_fallback: usedFallback };
}

async function answerExcerpt(bookId: number, section: any): Promise<string> {
  const source = sourceFor(bookId, 'answers');
  if (!source?.extracted_text_path) return 'No separate answer key was imported.';
  const text = await fs.readFile(source.extracted_text_path, 'utf8');
  const lower = text.toLocaleLowerCase('de-DE');
  const titleTokens = String(section.title).toLocaleLowerCase('de-DE').split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 6);
  const patterns = [`kapitel ${section.lesson_number}`, `lektion ${section.lesson_number}`, ...titleTokens];
  let index = -1;
  for (const pattern of patterns) {
    index = lower.indexOf(pattern);
    if (index >= 0) break;
  }
  if (index < 0) {
    const linePattern = new RegExp(`(?:^|\\n)\\s*${section.lesson_number}\\s`, 'm');
    index = text.search(linePattern);
  }
  if (index < 0) return text.slice(0, 12_000);
  return text.slice(Math.max(0, index - 1_500), Math.min(text.length, index + 12_000));
}

async function answerPageImages(bookId: number, lessonNumber: number): Promise<Buffer[]> {
  const source = sourceFor(bookId, 'answers');
  if (!source) return [];
  const totalSections = Math.max(1, Number((getDb().prepare('SELECT COUNT(*) AS count FROM book_sections WHERE book_id = ?').get(bookId) as any)?.count || 1));
  const totalPages = Math.max(1, Number(source.page_count || 1));
  const center = Math.max(1, Math.min(totalPages, Math.round(((lessonNumber - 0.5) / totalSections) * totalPages)));
  return renderPdfPages(source.storage_path, Math.max(1, center - 2), Math.min(totalPages, center + 2), 1500);
}

function fixedQuizMetadata(book: BookRow, section: any, generated: any): any {
  const slugBase = String(generated?.slug || section.title)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 95) || `lektion-${section.lesson_number}`;
  const questions = Array.isArray(generated?.questions) ? generated.questions.map((raw: any) => {
    const data = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {};
    let type = raw?.type;
    let answer = raw?.answer;
    let audioText = raw?.audio_text || data.audio_text || null;
    if (type === 'mcq' && typeof answer === 'string') {
      const options = Array.isArray(data.options) ? data.options : Array.isArray(data.choices) ? data.choices : [];
      const index = options.findIndex((option: unknown) => String(option) === answer);
      if (index >= 0) answer = index;
    }
    if (type === 'listening' && !audioText) {
      audioText = typeof answer === 'string' ? answer : Array.isArray(answer) ? String(answer[0] || '') : '';
    }
    if (type === 'matching' && answer && typeof answer === 'object' && !Array.isArray(answer)) {
      const left = Array.isArray(data.left) ? data.left : [];
      const right = Array.isArray(data.right) ? data.right : [];
      const pairs = Object.entries(answer as Record<string, unknown>);
      if (pairs.length && pairs.every(([key, value]) => /^\d+$/.test(key) && /^\d+$/.test(String(value)))) {
        answer = Object.fromEntries(pairs.map(([key, value]) => [String(left[Number(key)] || key), String(right[Number(value)] || value)]));
      }
    }
    if (type === 'cloze' && !/\[\d+\]/.test(String(raw?.prompt || ''))) type = 'fill_blank';
    return {
      type,
      prompt: raw?.prompt,
      data,
      answer,
      explanation: raw?.explanation,
      ...(audioText ? { audio_text: audioText } : {}),
      source_ref: raw?.source_ref,
    };
  }) : [];
  return {
    title: String(generated?.title || `Lektion ${section.lesson_number} · ${section.title}`).slice(0, 200),
    source: `${book.name}, S. ${section.printed_page_start}–${section.printed_page_end}`,
    book_id: book.id,
    lesson_number: section.lesson_number,
    slug: `l${section.lesson_number}-${slugBase}`.slice(0, 120),
    pdf_page_start: section.pdf_page_start,
    pdf_page_end: section.pdf_page_end,
    printed_page_start: section.printed_page_start,
    printed_page_end: section.printed_page_end,
    questions,
  };
}

export async function generateQuizDraft(bookId: number, requestedSectionId?: number) {
  const book = bookById(bookId);
  const db = getDb();
  const section = requestedSectionId
    ? db.prepare('SELECT * FROM book_sections WHERE id = ? AND book_id = ?').get(requestedSectionId, bookId) as any
    : db.prepare(`SELECT s.* FROM book_sections s
        WHERE s.book_id = ?
          AND NOT EXISTS (SELECT 1 FROM quizzes q WHERE q.book_id = s.book_id AND q.lesson_number = s.lesson_number)
          AND NOT EXISTS (SELECT 1 FROM quiz_drafts d WHERE d.section_id = s.id AND d.status IN ('draft','published'))
        ORDER BY s.lesson_number LIMIT 1`).get(bookId) as any;
  if (!section) throw new Error('No unprocessed section is available. Analyze the book first or choose another section.');
  const source = sourceFor(bookId, 'book');
  if (!source) throw new Error('Import or upload the book PDF first.');

  const lessonText = await extractPdf(source.storage_path, section.pdf_page_start, section.pdf_page_end);
  const solutions = await answerExcerpt(bookId, section);
  const lessonImages = lessonText.length < 40 ? await renderPdfPages(source.storage_path, section.pdf_page_start, section.pdf_page_end) : [];
  const solutionImages = solutions.length < 40 ? await answerPageImages(bookId, section.lesson_number) : [];
  if (lessonText.length < 40 && !lessonImages.length) throw new Error('The selected pages contain no extractable text or renderable images.');
  const system = `You are a senior German curriculum designer and assessment engineer. Build an original digital mastery lesson grounded only in the supplied textbook pages and matching answer key. Your job is long-term acquisition, not page transcription. Never reproduce long copyrighted passages. Preserve the rule, progression, exceptions, and difficulty, then teach them through newly written examples. German is the learning language; English or Arabic may appear only as brief support. Return valid JSON only.`;
  const prompt = `Transform this lesson into a 14–18 question digital mastery sequence. The learner's goal is durable B2–C1 command, not short-term recognition.

LEARNING DESIGN
1. UNDERSTAND (2–3 items): notice the rule, meaning, form, and one important contrast.
2. RETRIEVE (5–6 items): recall or produce the form without seeing the answer. Prefer fill_blank, typing, cloze, and listening.
3. DISCRIMINATE (2–3 items): diagnose realistic learner errors and near-miss forms. MCQ may be used here, but no more than 25% of the full quiz.
4. TRANSFER (3–4 items): apply the same rule in new everyday, academic, and professional contexts not copied from the book.
5. MASTER (1–2 items): demanding mixed-context production at the lesson's highest level.

QUALITY RULES
- Move from supported to independent production and from simple to complex.
- Use newly written, natural German examples; do not copy exercise blocks or answer-key sentences.
- Test every major sub-rule or exception visible on these pages at least once.
- Avoid trivia, ambiguous answers, duplicate questions, and clues that reveal the answer.
- For text answers, include reasonable variants in data.accepted_answers.
- Each data object must also contain: stage (understand|retrieve|discriminate|transfer|master), difficulty (1–5), and concept (short stable label).
- Every explanation must teach: the rule, why the answer works, and—when useful—why the tempting alternative fails. Keep it concise.
- Every question needs an exact source_ref using the printed page and rule/exercise label.
- Verify all answers against the lesson and use the answer key only when its labels clearly match.

BOOK: ${book.name}
LESSON: ${section.lesson_number} — ${section.title}
PRINTED PAGES: ${section.printed_page_start}–${section.printed_page_end}
PDF PAGES: ${section.pdf_page_start}–${section.pdf_page_end}

${lessonText.length >= 40 ? `LESSON TEXT\n${lessonText.slice(0, 40_000)}` : `The first ${lessonImages.length} attached images are the ordered lesson pages.`}

${solutions.length >= 40 ? `POSSIBLE ANSWER-KEY EXCERPT\n${solutions.slice(0, 14_000)}` : solutionImages.length ? `The next ${solutionImages.length} attached images are a likely nearby region of the answer key. Use them only if their chapter/exercise labels match lesson ${section.lesson_number}.` : 'No separate answer-key content is available.'}

OUTPUT
Return exactly one JSON object with title, slug, and questions. Each question requires: type, prompt, data, answer, explanation, source_ref. Allowed types: mcq, fill_blank, translation, typing, listening, matching, cloze. For mcq, data.options contains 2–8 options and answer is the zero-based numeric index. For matching, data.left/right are equal arrays and answer is a text-to-text object map. For listening include natural German audio_text. For cloze use [1], [2] markers and an ordered answer array.`;
  const visionImages = [...lessonImages, ...solutionImages].map((data) => ({ data, detail: 'high' as const }));

  let generated: any = null;
  let validation = { ok: false, errors: [{ path: '', message: 'Generation did not run.' }] };
  let finalPayload: QuizPayload | undefined;
  let bestPayload: any = null;
  let bestValidation = validation;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = visionImages.length
      ? await chatWithImages(`${prompt}${feedback}`, visionImages, 5_000, system)
      : await chat([{ role: 'user', content: `${prompt}${feedback}` }], 5_000, system);
    try {
      generated = parseJsonObject(response);
      const candidate = fixedQuizMetadata(book, section, generated);
      const checked = validateQuizPayload(candidate);
      validation = checked.validation;
      finalPayload = checked.data;
      if (finalPayload) break;
      if (!bestPayload || validation.errors.length < bestValidation.errors.length) {
        bestPayload = candidate;
        bestValidation = validation;
      }
      feedback = `\n\nYour previous JSON failed validation. Correct these issues and return the complete corrected JSON only:\n${validation.errors.map((error) => `- ${error.path}: ${error.message}`).join('\n')}`;
    } catch (error: any) {
      if (!bestPayload) validation = { ok: false, errors: [{ path: '', message: error?.message || 'Invalid AI JSON.' }] };
      feedback = `\n\nYour previous response was not valid JSON. Return the complete quiz as JSON only, without Markdown.`;
    }
  }

  if (!finalPayload && bestPayload) {
    validation = bestValidation;
  }
  const payload = finalPayload || bestPayload || fixedQuizMetadata(book, section, generated || { questions: [] });
  const now = Date.now();
  const info = db.prepare(`INSERT INTO quiz_drafts(
    book_id, section_id, lesson_number, title, payload, validation, status, model, prompt_version, created_at, updated_at
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    bookId,
    section.id,
    section.lesson_number,
    payload.title || section.title,
    JSON.stringify(payload),
    JSON.stringify(validation),
    validation.ok ? 'draft' : 'invalid',
    activeModel(),
    PROMPT_VERSION,
    now,
    now,
  );
  return { id: Number(info.lastInsertRowid), validation };
}

export function ingestionOverview(bookId: number) {
  bookById(bookId);
  const db = getDb();
  return {
    sources: db.prepare('SELECT id, kind, filename, checksum, page_count, created_at, updated_at FROM book_sources WHERE book_id = ? ORDER BY kind').all(bookId),
    sections: db.prepare(`SELECT s.*,
      (SELECT status FROM quiz_drafts d WHERE d.section_id = s.id ORDER BY d.id DESC LIMIT 1) AS draft_status,
      (SELECT id FROM quiz_drafts d WHERE d.section_id = s.id ORDER BY d.id DESC LIMIT 1) AS draft_id,
      (SELECT id FROM quizzes q WHERE q.book_id = s.book_id AND q.lesson_number = s.lesson_number LIMIT 1) AS quiz_id
      FROM book_sections s WHERE s.book_id = ? ORDER BY s.lesson_number`).all(bookId),
    drafts: db.prepare('SELECT * FROM quiz_drafts WHERE book_id = ? ORDER BY id DESC LIMIT 30').all(bookId).map((draft: any) => ({
      ...draft,
      payload: JSON.parse(draft.payload),
      validation: JSON.parse(draft.validation),
    })),
  };
}

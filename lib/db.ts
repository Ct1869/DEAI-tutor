import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data.db');
let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source TEXT,
      created_at INTEGER NOT NULL,
      scheduled_for TEXT,
      completed INTEGER DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      book_id INTEGER,
      pdf_page_start INTEGER,
      pdf_page_end INTEGER,
      printed_page_start INTEGER,
      printed_page_end INTEGER
    );
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      drive_file_id TEXT,
      drive_url TEXT,
      answer_key_file_id TEXT,
      answer_key_url TEXT,
      page_offset INTEGER,
      total_pdf_pages INTEGER,
      printed_page_start INTEGER,
      printed_page_end INTEGER,
      pages_per_day INTEGER DEFAULT 4,
      notes TEXT,
      created_at INTEGER NOT NULL,
      archived_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS book_progress (
      book_id INTEGER PRIMARY KEY,
      last_pdf_page INTEGER,
      last_printed_page INTEGER,
      last_quiz_date TEXT,
      last_quiz_id INTEGER,
      notes TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      data TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT,
      audio_text TEXT,
      source_ref TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS book_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      checksum TEXT NOT NULL,
      page_count INTEGER,
      extracted_text_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, kind)
    );
    CREATE TABLE IF NOT EXISTS book_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      pdf_page_start INTEGER NOT NULL,
      pdf_page_end INTEGER NOT NULL,
      printed_page_start INTEGER NOT NULL,
      printed_page_end INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, lesson_number)
    );
    CREATE TABLE IF NOT EXISTS quiz_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      section_id INTEGER,
      lesson_number INTEGER,
      title TEXT NOT NULL,
      payload TEXT NOT NULL,
      validation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      model TEXT,
      prompt_version TEXT,
      published_quiz_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (section_id) REFERENCES book_sections(id) ON DELETE SET NULL,
      FOREIGN KEY (published_quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      user_answer TEXT,
      correct INTEGER NOT NULL,
      answered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      translation TEXT,
      article TEXT,
      example TEXT,
      notes TEXT,
      ease REAL DEFAULT 2.5,
      interval_days INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      due_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_reviewed_at INTEGER,
      writing_rotate INTEGER NOT NULL DEFAULT 1,
      writing_used_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_progress (
      user TEXT NOT NULL,
      quiz_id INTEGER NOT NULL,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user, quiz_id)
    );
    CREATE TABLE IF NOT EXISTS question_mastery (
      question_id INTEGER PRIMARY KEY,
      quiz_id INTEGER NOT NULL,
      ease REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      correct_streak INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      last_correct INTEGER,
      last_answered_at INTEGER,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grammar_tips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_phrase TEXT NOT NULL,
      rule TEXT NOT NULL,
      example TEXT NOT NULL,
      memory_hook TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS writing_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch INTEGER NOT NULL DEFAULT 0,
      sentences TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS writing_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL,
      sentence_index INTEGER NOT NULL,
      user_input TEXT NOT NULL,
      score INTEGER,
      feedback TEXT,
      submitted_at INTEGER NOT NULL,
      FOREIGN KEY (prompt_id) REFERENCES writing_prompts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_quizzes_scheduled ON quizzes(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_vocab_due ON vocab(due_at);
    CREATE INDEX IF NOT EXISTS idx_quizzes_book ON quizzes(book_id);
    CREATE INDEX IF NOT EXISTS idx_book_sections_book ON book_sections(book_id, lesson_number);
    CREATE INDEX IF NOT EXISTS idx_quiz_drafts_book ON quiz_drafts(book_id, status, id DESC);
    CREATE INDEX IF NOT EXISTS idx_question_mastery_due ON question_mastery(due_at, quiz_id);
  `);
  // Additive column migrations for existing DBs (quizzes table pre-dates book linkage).
  const cols = (db.prepare(`PRAGMA table_info(quizzes)`).all() as { name: string }[]).map(c => c.name);
  const addIfMissing = (col: string, sql: string) => { if (!cols.includes(col)) db.exec(sql); };
  addIfMissing('book_id', `ALTER TABLE quizzes ADD COLUMN book_id INTEGER`);
  addIfMissing('pdf_page_start', `ALTER TABLE quizzes ADD COLUMN pdf_page_start INTEGER`);
  addIfMissing('pdf_page_end', `ALTER TABLE quizzes ADD COLUMN pdf_page_end INTEGER`);
  addIfMissing('printed_page_start', `ALTER TABLE quizzes ADD COLUMN printed_page_start INTEGER`);
  addIfMissing('printed_page_end', `ALTER TABLE quizzes ADD COLUMN printed_page_end INTEGER`);
  addIfMissing('lesson_number', `ALTER TABLE quizzes ADD COLUMN lesson_number INTEGER`);
  addIfMissing('slug', `ALTER TABLE quizzes ADD COLUMN slug TEXT`);
  addIfMissing('book_code', `ALTER TABLE quizzes ADD COLUMN book_code TEXT`);
  const qcols = (db.prepare(`PRAGMA table_info(questions)`).all() as { name: string }[]).map(c => c.name);
  if (!qcols.includes('source_ref')) db.exec(`ALTER TABLE questions ADD COLUMN source_ref TEXT`);
  const bcols = (db.prepare(`PRAGMA table_info(books)`).all() as { name: string }[]).map(c => c.name);
  if (!bcols.includes('code')) db.exec(`ALTER TABLE books ADD COLUMN code TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS books_code_unique ON books(code) WHERE code IS NOT NULL`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS quizzes_book_slug_unique ON quizzes(book_code, slug) WHERE slug IS NOT NULL AND book_code IS NOT NULL`);
  const vcols = (db.prepare(`PRAGMA table_info(vocab)`).all() as { name: string }[]).map(c => c.name);
  const addVocabIfMissing = (col: string, sql: string) => { if (!vcols.includes(col)) db.exec(sql); };
  addVocabIfMissing('examples', `ALTER TABLE vocab ADD COLUMN examples TEXT`);
  addVocabIfMissing('family', `ALTER TABLE vocab ADD COLUMN family TEXT`);
  addVocabIfMissing('source', `ALTER TABLE vocab ADD COLUMN source TEXT`);
  addVocabIfMissing('writing_rotate', `ALTER TABLE vocab ADD COLUMN writing_rotate INTEGER NOT NULL DEFAULT 1`);
  addVocabIfMissing('writing_used_at', `ALTER TABLE vocab ADD COLUMN writing_used_at INTEGER NOT NULL DEFAULT 0`);

  // Migrate writing_prompts: replace UNIQUE(date) with batch column (no unique constraint)
  const wpCols = (db.prepare(`PRAGMA table_info(writing_prompts)`).all() as { name: string }[]).map(c => c.name);
  if (!wpCols.includes('batch')) {
    db.exec(`
      CREATE TABLE writing_prompts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        batch INTEGER NOT NULL DEFAULT 0,
        sentences TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO writing_prompts_new(id, date, batch, sentences, created_at)
        SELECT id, date, 0, sentences, created_at FROM writing_prompts;
      DROP TABLE writing_prompts;
      ALTER TABLE writing_prompts_new RENAME TO writing_prompts;
    `);
  }
  const wpCols2 = (db.prepare(`PRAGMA table_info(writing_prompts)`).all() as { name: string }[]).map(c => c.name);
  if (!wpCols2.includes('vocab_rotation')) {
    db.exec(`ALTER TABLE writing_prompts ADD COLUMN vocab_rotation TEXT`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS lookup_cache (
      word TEXT PRIMARY KEY,
      translation TEXT,
      senses TEXT,
      source TEXT,
      arabic TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  const lcCols = (db.prepare(`PRAGMA table_info(lookup_cache)`).all() as { name: string }[]).map(c => c.name);
  if (!lcCols.includes('arabic')) {
    db.exec(`ALTER TABLE lookup_cache ADD COLUMN arabic TEXT`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS perf_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      path TEXT,
      value REAL,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_perf_ts ON perf_events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_perf_kind ON perf_events(kind, ts DESC);
  `);
  // Pre-generated practice sentences. Generating on demand meant a ~20s wait and
  // a page that fell back to the same static deck on every refresh; serving from
  // a pool that a background job keeps topped up makes it instant instead.
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      topic TEXT,
      de TEXT NOT NULL UNIQUE,
      en TEXT,
      ar TEXT,
      created_at INTEGER NOT NULL,
      served_at INTEGER NOT NULL DEFAULT 0,
      serve_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pool_pick ON practice_pool(level, served_at, id);
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_book_lesson ON quizzes(book_id, lesson_number) WHERE lesson_number IS NOT NULL`);
  return db;
}

export function getStat(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM stats WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setStat(key: string, value: string) {
  getDb().prepare('INSERT INTO stats(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function bumpStreak() {
  const last = getStat('last_active_date');
  const t = today();
  if (last === t) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const current = parseInt(getStat('streak', '0') || '0', 10);
  const next = last === yesterday ? current + 1 : 1;
  setStat('streak', String(next));
  setStat('last_active_date', t);
  const best = parseInt(getStat('best_streak', '0') || '0', 10);
  if (next > best) setStat('best_streak', String(next));
}

export function addXp(amount: number) {
  const cur = parseInt(getStat('xp', '0') || '0', 10);
  setStat('xp', String(cur + amount));
}

import Database from 'better-sqlite3';
import path from 'path';
import type { Attempt, Review, Session } from './types';
import type { LearningState } from './engine';

let live: Database.Database | undefined;
export function openTutorDb(filename = process.env.TUTOR_DB_PATH || path.join(process.cwd(), 'private', 'pilot-learning.db')): Database.Database {
  const db = filename === ':memory:' ? new Database(':memory:') : (live ||= new Database(filename));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tutor_sessions(id TEXT PRIMARY KEY, learner TEXT NOT NULL, unit_id TEXT NOT NULL, data TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER);
    CREATE TABLE IF NOT EXISTS tutor_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT, learner TEXT NOT NULL, session_id TEXT NOT NULL, unit_id TEXT NOT NULL, objective_id TEXT NOT NULL, activity_id TEXT NOT NULL, phase TEXT NOT NULL, response TEXT NOT NULL, correct INTEGER, assisted INTEGER NOT NULL, feedback TEXT NOT NULL, grading TEXT NOT NULL, confidence REAL NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tutor_reviews(learner TEXT NOT NULL, objective_id TEXT NOT NULL, evidence_kind TEXT NOT NULL, due_at INTEGER NOT NULL, interval_days REAL NOT NULL, ease REAL NOT NULL, successes INTEGER NOT NULL, lapses INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY(learner, objective_id, evidence_kind));
    CREATE INDEX IF NOT EXISTS tutor_due ON tutor_reviews(learner, due_at);
  `);
  return db;
}

export function getLearningState(db: Database.Database, learner: string): LearningState {
  const attempts = db.prepare('SELECT * FROM tutor_attempts WHERE learner = ? ORDER BY id').all(learner) as any[];
  const reviews = db.prepare('SELECT * FROM tutor_reviews WHERE learner = ? ORDER BY due_at').all(learner) as any[];
  return {
    attempts: attempts.map(a => ({ id: a.id, sessionId: a.session_id, unitId: a.unit_id, objectiveId: a.objective_id, activityId: a.activity_id, phase: a.phase, response: a.response, correct: a.correct == null ? null : Boolean(a.correct), assisted: Boolean(a.assisted), feedback: a.feedback, grading: a.grading, confidence: a.confidence, createdAt: a.created_at } as Attempt)),
    reviews: reviews.map(r => ({ objectiveId: r.objective_id, evidenceKind: r.evidence_kind, dueAt: r.due_at, intervalDays: r.interval_days, ease: r.ease, successes: r.successes, lapses: r.lapses, lastAt: r.last_at } as Review)),
  };
}

export function getSession(db: Database.Database, learner: string, id: string): Session | null {
  const row = db.prepare('SELECT data FROM tutor_sessions WHERE id = ? AND learner = ?').get(id, learner) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function latestSession(db: Database.Database, learner: string): Session | null {
  const row = db.prepare('SELECT data FROM tutor_sessions WHERE learner = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(learner) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveSession(db: Database.Database, learner: string, session: Session) {
  db.prepare(`INSERT INTO tutor_sessions(id, learner, unit_id, data, started_at, ended_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, ended_at=excluded.ended_at`).run(session.id, learner, session.unitId, JSON.stringify(session), session.startedAt, session.endedAt ?? null);
}

export function saveResponse(db: Database.Database, learner: string, session: Session, attempt: Attempt, reviews: Review[]) {
  db.transaction(() => {
    db.prepare(`INSERT INTO tutor_attempts(learner,session_id,unit_id,objective_id,activity_id,phase,response,correct,assisted,feedback,grading,confidence,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      learner,attempt.sessionId,attempt.unitId,attempt.objectiveId,attempt.activityId,attempt.phase,attempt.response,attempt.correct == null ? null : Number(attempt.correct),Number(attempt.assisted),attempt.feedback,attempt.grading,attempt.confidence,attempt.createdAt);
    const upsert = db.prepare(`INSERT INTO tutor_reviews(learner,objective_id,evidence_kind,due_at,interval_days,ease,successes,lapses,last_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(learner,objective_id,evidence_kind) DO UPDATE SET due_at=excluded.due_at,interval_days=excluded.interval_days,ease=excluded.ease,successes=excluded.successes,lapses=excluded.lapses,last_at=excluded.last_at`);
    for (const r of reviews) upsert.run(learner,r.objectiveId,r.evidenceKind,r.dueAt,r.intervalDays,r.ease,r.successes,r.lapses,r.lastAt);
    saveSession(db, learner, session);
  })();
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type PerfEvent = {
  ts?: number;
  kind: string;
  path?: string;
  value?: number;
  meta?: any;
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const events: PerfEvent[] = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) return NextResponse.json({ ok: true, inserted: 0 });
  const db = getDb();
  const stmt = db.prepare('INSERT INTO perf_events(ts, kind, path, value, meta) VALUES(?, ?, ?, ?, ?)');
  const insertMany = db.transaction((rows: PerfEvent[]) => {
    for (const e of rows) {
      if (!e || typeof e.kind !== 'string') continue;
      stmt.run(
        typeof e.ts === 'number' ? e.ts : Date.now(),
        e.kind,
        typeof e.path === 'string' ? e.path.slice(0, 500) : null,
        typeof e.value === 'number' ? e.value : null,
        e.meta != null ? JSON.stringify(e.meta).slice(0, 4000) : null,
      );
    }
  });
  insertMany(events);
  // Telemetry is only ever read as "recent"; without a trim this table grows
  // forever and is the one thing here with no natural upper bound.
  db.prepare('DELETE FROM perf_events WHERE ts < ?').run(Date.now() - PERF_RETENTION_MS);
  return NextResponse.json({ ok: true, inserted: events.length });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '300', 10)));
  const db = getDb();
  const rows = kind
    ? db.prepare('SELECT * FROM perf_events WHERE kind = ? ORDER BY ts DESC LIMIT ?').all(kind, limit)
    : db.prepare('SELECT * FROM perf_events ORDER BY ts DESC LIMIT ?').all(limit);
  return NextResponse.json({ events: rows });
}

export async function DELETE(_req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  getDb().prepare('DELETE FROM perf_events').run();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMING_KINDS = ['lcp', 'long_task', 'slow_interaction', 'slow_fetch', 'navigation'];
const ERROR_KINDS = ['js_error', 'promise_rejection', 'fetch_error'];

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const sinceMs = parseInt(url.searchParams.get('since') || String(Date.now() - 24 * 3600_000), 10);
  const db = getDb();

  const totals = db
    .prepare('SELECT kind, COUNT(*) as c FROM perf_events WHERE ts >= ? GROUP BY kind')
    .all(sinceMs) as { kind: string; c: number }[];
  const totalByKind: Record<string, number> = {};
  for (const r of totals) totalByKind[r.kind] = r.c;

  const timing: Record<string, { p50: number | null; p75: number | null; p95: number | null; max: number | null; n: number }> = {};
  for (const kind of TIMING_KINDS) {
    const rows = db
      .prepare('SELECT value FROM perf_events WHERE kind = ? AND ts >= ? AND value IS NOT NULL ORDER BY value ASC')
      .all(kind, sinceMs) as { value: number }[];
    const vals = rows.map((r) => r.value);
    timing[kind] = {
      p50: percentile(vals, 0.5),
      p75: percentile(vals, 0.75),
      p95: percentile(vals, 0.95),
      max: vals.length ? vals[vals.length - 1] : null,
      n: vals.length,
    };
  }

  const topErrors: { kind: string; message: string; count: number; lastTs: number; path: string | null }[] = [];
  for (const kind of ERROR_KINDS) {
    const rows = db
      .prepare('SELECT meta, path, ts FROM perf_events WHERE kind = ? AND ts >= ?')
      .all(kind, sinceMs) as { meta: string | null; path: string | null; ts: number }[];
    const groups = new Map<string, { count: number; lastTs: number; path: string | null }>();
    for (const r of rows) {
      let msg = '(no message)';
      if (r.meta) {
        try {
          const m = JSON.parse(r.meta);
          msg = (m.message || m.url || m.name || JSON.stringify(m)).slice(0, 200);
        } catch {}
      }
      const g = groups.get(msg);
      if (g) {
        g.count++;
        if (r.ts > g.lastTs) {
          g.lastTs = r.ts;
          g.path = r.path;
        }
      } else {
        groups.set(msg, { count: 1, lastTs: r.ts, path: r.path });
      }
    }
    for (const [message, g] of groups) topErrors.push({ kind, message, ...g });
  }
  topErrors.sort((a, b) => b.count - a.count);

  const slowPaths = db
    .prepare(
      `SELECT path, COUNT(*) as count, AVG(value) as avg_ms, MAX(value) as max_ms
       FROM perf_events
       WHERE kind = 'slow_fetch' AND ts >= ? AND path IS NOT NULL
       GROUP BY path
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(sinceMs);

  const slowApis = db
    .prepare(
      `SELECT json_extract(meta, '$.url') as url, COUNT(*) as count, AVG(value) as avg_ms, MAX(value) as max_ms
       FROM perf_events
       WHERE kind = 'slow_fetch' AND ts >= ?
       GROUP BY url
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(sinceMs);

  const now = Date.now();
  const windowMs = now - sinceMs;
  const buckets = 24;
  const bucketSize = Math.max(60_000, Math.floor(windowMs / buckets));
  const timeline = db
    .prepare(
      `SELECT CAST((ts - ?) / ? AS INTEGER) as bucket, kind, COUNT(*) as c
       FROM perf_events
       WHERE ts >= ?
       GROUP BY bucket, kind`
    )
    .all(sinceMs, bucketSize, sinceMs) as { bucket: number; kind: string; c: number }[];

  return NextResponse.json({
    sinceMs,
    nowMs: now,
    bucketSize,
    totalByKind,
    timing,
    topErrors: topErrors.slice(0, 15),
    slowPaths,
    slowApis,
    timeline,
  });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const olderThanMs = parseInt(url.searchParams.get('olderThan') || '0', 10);
  if (!olderThanMs) return NextResponse.json({ error: 'olderThan required' }, { status: 400 });
  const res = getDb().prepare('DELETE FROM perf_events WHERE ts < ?').run(olderThanMs);
  return NextResponse.json({ ok: true, deleted: res.changes });
}

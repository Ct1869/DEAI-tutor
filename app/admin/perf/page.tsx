'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';

type PerfRow = { id: number; ts: number; kind: string; path: string | null; value: number | null; meta: string | null };

type Summary = {
  sinceMs: number;
  nowMs: number;
  bucketSize: number;
  totalByKind: Record<string, number>;
  timing: Record<string, { p50: number | null; p75: number | null; p95: number | null; max: number | null; n: number }>;
  topErrors: { kind: string; message: string; count: number; lastTs: number; path: string | null }[];
  slowPaths: { path: string; count: number; avg_ms: number; max_ms: number }[];
  slowApis: { url: string | null; count: number; avg_ms: number; max_ms: number }[];
  timeline: { bucket: number; kind: string; c: number }[];
};

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  js_error:          { label: 'JS-Fehler',           color: '#dc2626' },
  promise_rejection: { label: 'Promise-Fehler',      color: '#dc2626' },
  fetch_error:       { label: 'Fetch-Fehler',        color: '#b91c1c' },
  slow_fetch:        { label: 'Langsamer API-Call',  color: '#d97706' },
  navigation:        { label: 'Navigation',          color: '#0369a1' },
  lcp:               { label: 'LCP',                 color: '#7c3aed' },
  long_task:         { label: 'Long Task',           color: '#ea580c' },
  slow_interaction:  { label: 'Langsame Interaktion', color: '#db2777' },
};

const RANGES: { label: string; ms: number }[] = [
  { label: '1h', ms: 3600_000 },
  { label: '6h', ms: 6 * 3600_000 },
  { label: '24h', ms: 24 * 3600_000 },
  { label: '7d', ms: 7 * 24 * 3600_000 },
  { label: '30d', ms: 30 * 24 * 3600_000 },
];

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
}
function fmtMs(v: number | null) {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)} ms`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="panel" style={{ padding: 14, minWidth: 0 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-mute)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 800, color: color || 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${(v / max) * 100}%`,
          minHeight: v > 0 ? 2 : 1,
          background: v > 0 ? color : 'var(--border)',
          borderRadius: 2,
          opacity: v > 0 ? 1 : 0.4,
        }} />
      ))}
    </div>
  );
}

export default function PerfPage() {
  const [rangeMs, setRangeMs] = useState<number>(24 * 3600_000);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function load() {
    setLoading(true);
    const since = Date.now() - rangeMs;
    const eventsUrl = filter
      ? `/api/perf?kind=${filter}&limit=500`
      : `/api/perf?limit=500`;
    const [s, e] = await Promise.all([
      fetch(`/api/perf/summary?since=${since}`).then((r) => r.json()),
      fetch(eventsUrl).then((r) => r.json()),
    ]);
    setSummary(s);
    setRows((e.events || []).filter((r: PerfRow) => r.ts >= since));
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, rangeMs]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoRefresh, filter, rangeMs]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (r.path || '').toLowerCase().includes(q) ||
      (r.meta || '').toLowerCase().includes(q) ||
      r.kind.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalErrors =
    (summary?.totalByKind.js_error || 0) +
    (summary?.totalByKind.promise_rejection || 0) +
    (summary?.totalByKind.fetch_error || 0);
  const totalSlow =
    (summary?.totalByKind.slow_fetch || 0) +
    (summary?.totalByKind.slow_interaction || 0) +
    (summary?.totalByKind.long_task || 0);

  const sparkData = useMemo(() => {
    if (!summary) return { errors: [], slow: [], all: [] };
    const buckets = Math.max(1, Math.round((summary.nowMs - summary.sinceMs) / summary.bucketSize));
    const errors = new Array(buckets).fill(0);
    const slow = new Array(buckets).fill(0);
    const all = new Array(buckets).fill(0);
    for (const t of summary.timeline) {
      if (t.bucket < 0 || t.bucket >= buckets) continue;
      all[t.bucket] += t.c;
      if (['js_error', 'promise_rejection', 'fetch_error'].includes(t.kind)) errors[t.bucket] += t.c;
      if (['slow_fetch', 'slow_interaction', 'long_task'].includes(t.kind)) slow[t.bucket] += t.c;
    }
    return { errors, slow, all };
  }, [summary]);

  async function clearAll() {
    if (!confirm('Alle Perf-Events löschen?')) return;
    await fetch('/api/perf', { method: 'DELETE' });
    load();
  }
  async function purgeOld(days: number) {
    if (!confirm(`Events älter als ${days} Tage löschen?`)) return;
    const cutoff = Date.now() - days * 24 * 3600_000;
    const r = await fetch(`/api/perf/summary?olderThan=${cutoff}`, { method: 'DELETE' }).then((r) => r.json());
    alert(`${r.deleted || 0} Events gelöscht`);
    load();
  }

  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      <div className="overline">Diagnostik</div>
      <h1 className="display">Performance & Fehler</h1>

      <div className="panel" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-mute)', fontWeight: 700, marginRight: 4 }}>Zeitraum:</span>
        {RANGES.map((r) => (
          <button key={r.label} className={`btn ${rangeMs === r.ms ? 'primary' : ''}`} onClick={() => setRangeMs(r.ms)}>
            {r.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto 15s
        </label>
        <button className="btn" onClick={load} disabled={loading}>↻ {loading ? '…' : ''}</button>
      </div>

      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
            <StatCard label="Fehler gesamt" value={String(totalErrors)} color={totalErrors > 0 ? '#dc2626' : undefined} sub={`${summary.totalByKind.js_error || 0} JS · ${summary.totalByKind.fetch_error || 0} Fetch`} />
            <StatCard label="Performance-Issues" value={String(totalSlow)} color={totalSlow > 0 ? '#d97706' : undefined} sub={`${summary.totalByKind.slow_fetch || 0} API · ${summary.totalByKind.long_task || 0} Tasks`} />
            <StatCard label="LCP p75" value={fmtMs(summary.timing.lcp?.p75 ?? null)} sub={`p95 ${fmtMs(summary.timing.lcp?.p95 ?? null)} · n=${summary.timing.lcp?.n || 0}`} color={(summary.timing.lcp?.p75 ?? 0) > 2500 ? '#dc2626' : (summary.timing.lcp?.p75 ?? 0) > 1500 ? '#d97706' : '#16a34a'} />
            <StatCard label="Navigation p75" value={fmtMs(summary.timing.navigation?.p75 ?? null)} sub={`p95 ${fmtMs(summary.timing.navigation?.p95 ?? null)} · n=${summary.timing.navigation?.n || 0}`} />
            <StatCard label="API p95" value={fmtMs(summary.timing.slow_fetch?.p95 ?? null)} sub={`p75 ${fmtMs(summary.timing.slow_fetch?.p75 ?? null)} · n=${summary.timing.slow_fetch?.n || 0}`} color={(summary.timing.slow_fetch?.p95 ?? 0) > 3000 ? '#dc2626' : undefined} />
            <StatCard label="Interaktion p95" value={fmtMs(summary.timing.slow_interaction?.p95 ?? null)} sub={`p75 ${fmtMs(summary.timing.slow_interaction?.p75 ?? null)} · n=${summary.timing.slow_interaction?.n || 0}`} />
          </div>

          <div className="panel" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 700, marginBottom: 6 }}>Fehler über Zeit</div>
              <Sparkline data={sparkData.errors} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 700, marginBottom: 6 }}>Perf-Issues</div>
              <Sparkline data={sparkData.slow} color="#d97706" />
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-mute)', fontWeight: 700, marginBottom: 6 }}>Alle Events</div>
              <Sparkline data={sparkData.all} color="#0369a1" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 10, marginTop: 12 }}>
            <div className="panel">
              <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Top Fehler</h2>
              {summary.topErrors.length === 0 ? (
                <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Keine Fehler in diesem Zeitraum 🎉</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    {summary.topErrors.map((e, i) => {
                      const k = KIND_LABEL[e.kind];
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '1px 6px', borderRadius: 999, background: k.color + '22', color: k.color, fontWeight: 700, fontSize: 10 }}>{k.label}</span>
                          </td>
                          <td style={{ padding: '6px 4px', fontFamily: 'var(--f-mono)', wordBreak: 'break-word' }}>{e.message}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.count}×</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="panel">
              <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Langsame API-Calls</h2>
              {summary.slowApis.length === 0 ? (
                <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Keine langsamen Calls 🎉</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-mute)', textAlign: 'left' }}>
                      <th style={{ padding: '4px', fontWeight: 600 }}>URL</th>
                      <th style={{ padding: '4px', textAlign: 'right', fontWeight: 600 }}>Anzahl</th>
                      <th style={{ padding: '4px', textAlign: 'right', fontWeight: 600 }}>Ø</th>
                      <th style={{ padding: '4px', textAlign: 'right', fontWeight: 600 }}>Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.slowApis.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 4px', fontFamily: 'var(--f-mono)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.url || ''}>{s.url || '—'}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>{s.count}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtMs(s.avg_ms)}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>{fmtMs(s.max_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <div className="panel" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-mute)', fontWeight: 700, marginRight: 4 }}>Events:</span>
        <button className={`btn ${filter === '' ? 'primary' : ''}`} onClick={() => setFilter('')}>Alle</button>
        {Object.entries(KIND_LABEL).map(([k, v]) => {
          const count = summary?.totalByKind[k] || 0;
          return (
            <button
              key={k}
              className={`btn ${filter === k ? 'primary' : ''}`}
              onClick={() => setFilter(k)}
              style={{ borderColor: v.color, opacity: count === 0 ? 0.5 : 1 }}
            >
              {v.label}{count ? ` (${count})` : ''}
            </button>
          );
        })}
        <input
          className="btn"
          placeholder="Suche Pfad/Meldung…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, fontFamily: 'var(--f-mono)' }}
        />
        <button className="btn" onClick={() => purgeOld(7)}>&gt;7d löschen</button>
        <button className="btn" onClick={() => purgeOld(30)}>&gt;30d löschen</button>
        <button className="btn danger" onClick={clearAll}>Alles löschen</button>
      </div>

      <div className="panel" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-mute)' }}>Wird geladen…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-mute)' }}>Keine Events.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-alt)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Zeit</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Typ</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Pfad</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Wert</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const k = KIND_LABEL[r.kind] || { label: r.kind, color: '#475569' };
                let meta: any = null;
                try { if (r.meta) meta = JSON.parse(r.meta); } catch {}
                const detail = meta
                  ? meta.message || meta.url || meta.name || JSON.stringify(meta).slice(0, 140)
                  : '';
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--bg-alt)' : undefined }}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--f-mono)', whiteSpace: 'nowrap', color: 'var(--text-mute)' }}>{fmtTime(r.ts)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: k.color + '22', color: k.color, fontWeight: 700, fontSize: 11 }}>{k.label}</span>
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--f-mono)', color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path || '—'}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--f-mono)', textAlign: 'right', fontWeight: 700 }}>
                        {r.value != null ? fmtMs(r.value) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text)', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {detail}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ padding: '10px 16px', background: 'var(--bg-alt)', borderBottom: '1px solid var(--border)' }}>
                          <pre style={{ margin: 0, fontSize: 11, fontFamily: 'var(--f-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-dim)' }}>
                            {meta ? JSON.stringify(meta, null, 2) : '(no meta)'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

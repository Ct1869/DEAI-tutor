'use client';
import { useEffect } from 'react';

type Event = { ts: number; kind: string; path?: string; value?: number; meta?: any };

const FLUSH_INTERVAL_MS = 5000;
const SLOW_FETCH_MS = 3000;
const LONG_TASK_MS = 100;
const MAX_QUEUE = 200;

declare global {
  interface Window { __perfQ?: Event[]; __perfInstalled?: boolean; }
}

function flush(beacon = false) {
  const q = window.__perfQ || [];
  if (q.length === 0) return;
  const events = q.splice(0, q.length);
  const payload = JSON.stringify({ events });
  try {
    if (beacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/perf', blob);
      return;
    }
  } catch {}
  fetch('/api/perf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // requeue on failure (capped)
    const cur = window.__perfQ || [];
    window.__perfQ = [...events, ...cur].slice(-MAX_QUEUE);
  });
}

function push(e: Event) {
  if (!window.__perfQ) window.__perfQ = [];
  window.__perfQ.push(e);
  if (window.__perfQ.length > MAX_QUEUE) window.__perfQ = window.__perfQ.slice(-MAX_QUEUE);
}

function path() { return typeof location !== 'undefined' ? location.pathname + location.search : ''; }

export default function PerfTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.__perfInstalled) return;
    window.__perfInstalled = true;

    // JS errors
    const onError = (ev: ErrorEvent) => {
      push({
        ts: Date.now(), kind: 'js_error', path: path(),
        meta: {
          message: ev.message?.slice(0, 500),
          source: ev.filename, line: ev.lineno, col: ev.colno,
          stack: ev.error?.stack?.slice(0, 1500),
        },
      });
    };
    const onReject = (ev: PromiseRejectionEvent) => {
      const r: any = ev.reason;
      push({
        ts: Date.now(), kind: 'promise_rejection', path: path(),
        meta: {
          message: (typeof r === 'string' ? r : r?.message || String(r))?.slice(0, 500),
          stack: r?.stack?.slice(0, 1500),
        },
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);

    // Performance observers
    const observers: PerformanceObserver[] = [];
    const obs = (type: string, cb: (entries: PerformanceEntry[]) => void) => {
      try {
        const o = new PerformanceObserver((list) => cb(list.getEntries()));
        o.observe({ type, buffered: true } as any);
        observers.push(o);
      } catch {}
    };

    obs('navigation', (entries) => {
      for (const e of entries) {
        const n = e as PerformanceNavigationTiming;
        push({ ts: Date.now(), kind: 'navigation', path: path(), value: Math.round(n.duration), meta: {
          ttfb: Math.round(n.responseStart - n.requestStart),
          dom: Math.round(n.domContentLoadedEventEnd - n.startTime),
          load: Math.round(n.loadEventEnd - n.startTime),
          type: n.type,
        }});
      }
    });

    obs('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1] as any;
      if (last) push({ ts: Date.now(), kind: 'lcp', path: path(), value: Math.round(last.renderTime || last.loadTime || last.startTime) });
    });

    obs('longtask', (entries) => {
      for (const e of entries) {
        if (e.duration < LONG_TASK_MS) continue;
        push({ ts: Date.now(), kind: 'long_task', path: path(), value: Math.round(e.duration), meta: { name: e.name } });
      }
    });

    obs('event', (entries) => {
      for (const e of entries as any[]) {
        if (!e.duration || e.duration < 200) continue; // INP-ish
        push({ ts: Date.now(), kind: 'slow_interaction', path: path(), value: Math.round(e.duration), meta: { name: e.name } });
      }
    });

    // Wrap fetch to record slow API calls
    const origFetch = window.fetch.bind(window);
    (window as any).__origFetch = origFetch;
    function resolveUrl(input: any): string {
      try {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.toString();
        if (input && typeof input.url === 'string') return input.url; // Request
        return String(input ?? '');
      } catch { return ''; }
    }
    function resolveMethod(input: any, init?: any): string {
      try {
        if (init?.method) return String(init.method).toUpperCase();
        if (input && typeof input.method === 'string') return input.method.toUpperCase();
      } catch {}
      return 'GET';
    }
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const start = performance.now();
      const url = resolveUrl(args[0]);
      const method = resolveMethod(args[0], args[1]);
      const isPerfPing = url.includes('/api/perf');
      try {
        const res = await origFetch(...args);
        if (isPerfPing) return res;
        const dur = performance.now() - start;
        if (dur >= SLOW_FETCH_MS || !res.ok) {
          push({ ts: Date.now(), kind: 'slow_fetch', path: path(), value: Math.round(dur), meta: { url, method, status: res.status, ok: res.ok } });
        }
        return res;
      } catch (err: any) {
        if (!isPerfPing) {
          const dur = performance.now() - start;
          push({ ts: Date.now(), kind: 'fetch_error', path: path(), value: Math.round(dur), meta: { url, method, message: err?.message?.slice(0, 300) } });
        }
        throw err;
      }
    };

    const interval = window.setInterval(() => flush(false), FLUSH_INTERVAL_MS);
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      window.clearInterval(interval);
      for (const o of observers) o.disconnect();
    };
  }, []);

  return null;
}

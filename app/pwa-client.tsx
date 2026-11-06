'use client';
import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = 'loading' | 'unsupported' | 'insecure' | 'off' | 'on';

export default function PwaClient() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported'); return;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setState('insecure'); return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    }).catch(() => setState('off'));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('Notifications denied — enable in browser settings.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
      setState('on');
    } catch (err: any) {
      alert('Push setup failed: ' + (err?.message || err));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('off');
    } finally { setBusy(false); }
  }

  if (state === 'loading') return <button className="pillbtn" disabled>…</button>;
  if (state === 'unsupported') return <button className="pillbtn warn" onClick={() => alert('Browser does not support web push. On iPhone: install to Home Screen first, then open the app and try again.')}>N/A</button>;
  if (state === 'insecure') return <button className="pillbtn warn" onClick={() => alert('Push requires HTTPS. Load the site over https:// (e.g. a Cloudflare tunnel).')} title="Push requires HTTPS">HTTP</button>;
  if (state === 'on') return <button className="pillbtn on" onClick={disable} disabled={busy}>● An</button>;
  return <button className="pillbtn" onClick={enable} disabled={busy}>○ Wecken</button>;
}

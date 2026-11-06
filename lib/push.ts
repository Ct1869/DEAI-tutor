import webpush from 'web-push';
import { getDb } from './db';

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export async function sendToAll(payload: { title: string; body: string; url?: string; tag?: string }) {
  configure();
  const db = getDb();
  const subs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all() as any[];
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
    )
  );
  const del = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = (r.reason as any)?.statusCode;
      if (code === 404 || code === 410) del.run(subs[i].endpoint);
    }
  });
  return { sent: subs.length, ok: results.filter((r) => r.status === 'fulfilled').length };
}

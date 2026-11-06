import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { POOL_LEVELS, refillInBackground, refillLevel, takeFromPool, unseenCount } from '@/lib/practice-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const asked = String(url.searchParams.get('level') || 'B2').toUpperCase();
  const level = (POOL_LEVELS as readonly string[]).includes(asked)
    ? asked
    : POOL_LEVELS[Math.floor(Math.random() * POOL_LEVELS.length)];
  const count = Math.min(20, Math.max(1, Number(url.searchParams.get('count')) || 8));

  let cards = takeFromPool(level, count);

  // Cold pool (first ever visit for a level): generate once, synchronously, so
  // the page still has something rather than falling back to the static deck.
  if (cards.length < count) {
    try {
      await refillLevel(level, Math.max(12, count));
      cards = cards.concat(takeFromPool(level, count - cards.length));
    } catch (e: any) {
      if (!cards.length) {
        return NextResponse.json({ error: 'generation_failed', detail: String(e?.message || e) }, { status: 502 });
      }
    }
  }

  // Always top up afterwards (it no-ops above the threshold), so the pool climbs
  // to a comfortable buffer and later visits never hit the slow path.
  refillInBackground(level);

  return NextResponse.json({ level, cards, remaining: unseenCount(level) });
}

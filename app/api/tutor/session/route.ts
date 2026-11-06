import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { unit1 } from '@/tutor-content/unit1';
import { buildSession, findActivity, sessionReport } from '@/tutor-engine/engine';
import { getLearningState, latestSession, openTutorDb, saveSession } from '@/tutor-engine/store';
import { verifyFiles } from '@/tutor-engine/quality';
import path from 'path';
import { OllamaProvider } from '@/tutor-engine/provider';

export const runtime = 'nodejs';
export async function GET() {
  const learner = await getSessionUser();
  if (!learner) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = openTutorDb();
  const session = latestSession(db, learner);
  const provider = process.env.TUTOR_AI_VALIDATED === '1' ? new OllamaProvider() : undefined;
  const available = Boolean(provider && await provider.available());
  return NextResponse.json({ session, activity: session ? findActivity(unit1, session.currentActivityId) : null, model: available ? provider!.name : 'unavailable', limitedMode: !available, unit: { id: unit1.id, title: unit1.title } });
}
export async function POST(req: Request) {
  const learner = await getSessionUser();
  if (!learner) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const errors = verifyFiles(unit1, path.join(process.cwd(), 'private/books/4/book.pdf'), path.join(process.cwd(), 'private/books/4/answers.pdf'));
  if (errors.length) return NextResponse.json({ error: 'source verification failed', details: errors }, { status: 422 });
  const body = await req.json().catch(() => ({}));
  const db = openTutorDb();
  const provider = process.env.TUTOR_AI_VALIDATED === '1' ? new OllamaProvider() : undefined;
  const limitedMode = !(provider && await provider.available());
  const prior = latestSession(db, learner);
  if (prior) return NextResponse.json({ session: prior, activity: findActivity(unit1, prior.currentActivityId), limitedMode });
  const state = getLearningState(db, learner);
  const session = buildSession(unit1, state, Number(body.budgetMinutes || 30));
  saveSession(db, learner, session);
  return NextResponse.json({ session, activity: findActivity(unit1, session.currentActivityId), report: session.currentActivityId ? null : sessionReport(unit1, state, session), limitedMode });
}

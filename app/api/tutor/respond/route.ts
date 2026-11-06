import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { unit1 } from '@/tutor-content/unit1';
import { respond } from '@/tutor-engine/engine';
import { getLearningState, getSession, openTutorDb, saveResponse } from '@/tutor-engine/store';
import { OllamaProvider } from '@/tutor-engine/provider';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const learner = await getSessionUser();
  if (!learner) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = openTutorDb();
  const session = getSession(db, learner, String(body.sessionId || ''));
  if (!session || session.endedAt) return NextResponse.json({ error: 'active session not found' }, { status: 404 });
  if (body.activityId !== session.currentActivityId) return NextResponse.json({ error: 'stale activity' }, { status: 409 });
  try {
    const state = getLearningState(db, learner);
    const provider = process.env.TUTOR_AI_VALIDATED === '1' ? new OllamaProvider() : undefined;
    const raw = String(body.response || '');
    if (raw.length > 5000) return NextResponse.json({ error: 'response too long' }, { status: 413 });
    const { result, state: nextState } = await respond(unit1, session, state, raw, Boolean(body.assisted), provider);
    saveResponse(db, learner, result.session, result.attempt!, nextState.reviews);
    return NextResponse.json({ ...result, limitedMode: !(provider && await provider.available()) });
  } catch (error: any) { return NextResponse.json({ error: String(error?.message || error) }, { status: 422 }); }
}

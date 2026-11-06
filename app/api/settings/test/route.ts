import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { chat, currentBackend } from '@/lib/llm';
import { activeModel } from '@/lib/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prompt: string = (body?.prompt && typeof body.prompt === 'string')
    ? body.prompt.slice(0, 2_000)
    : 'Antworte in genau drei kurzen Zeilen: (1) ein deutscher Satz, (2) der gleiche Satz auf ägyptisch-arabisch, (3) der englische Satz. Thema: ein müder Zahnmedizin-Student.';
  const backend = await currentBackend();
  const model = activeModel();
  const startedAt = Date.now();

  try {
    const text = await chat(
      [{ role: 'user', content: prompt }],
      400,
      'You are a multilingual tutor. Respond exactly as requested.',
    );
    return NextResponse.json({
      ok: true,
      backend,
      model,
      elapsed_ms: Date.now() - startedAt,
      output: text,
    });
  } catch (error: any) {
    console.error('ChatGPT OAuth connection test failed:', error?.message || error);
    return NextResponse.json({
      ok: false,
      backend,
      model,
      elapsed_ms: Date.now() - startedAt,
      error: error?.message || String(error),
    }, { status: 500 });
  }
}

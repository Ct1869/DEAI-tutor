export type TutorJudgment = { correct: boolean | null; confidence: number; feedback: string; cause?: string; nextInstruction?: string };
export interface TutorProvider {
  name: string;
  available(): Promise<boolean>;
  assess(args: { rule: string; instruction: string; response: string; rubric?: string; context: string }): Promise<TutorJudgment>;
}

// This is an optional, local-only adapter. It does not make a paid request.
// It remains disabled unless explicitly configured and tested on this host.
export class OllamaProvider implements TutorProvider {
  name = 'ollama-local';
  private url: string;
  private model: string;
  constructor(url = process.env.TUTOR_OLLAMA_URL || '', model = process.env.TUTOR_OLLAMA_MODEL || '') { this.url = url; this.model = model; }
  async available(): Promise<boolean> {
    if (!this.url || !this.model || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(this.url)) return false;
    try { const res = await fetch(`${this.url.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(1500) }); if (!res.ok) return false; const data = await res.json(); return Array.isArray(data.models) && data.models.some((m: any) => m.name === this.model || m.model === this.model); } catch { return false; }
  }
  async assess(args: { rule: string; instruction: string; response: string; rubric?: string; context: string }): Promise<TutorJudgment> {
    if (!(await this.available())) throw new Error('local model unavailable');
    const res = await fetch(`${this.url.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({
      model: this.model, stream: false, format: 'json', messages: [
        { role: 'system', content: 'You are a German tutor assessor. Return JSON: correct boolean|null, confidence 0..1, feedback string, cause string, nextInstruction string. If ambiguous, use null. Judge meaning, grammar, and naturalness separately. Never claim pronunciation from a transcript.' },
        { role: 'user', content: JSON.stringify(args) },
      ],
    }) });
    if (!res.ok) throw new Error(`local model failed: ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(String(data?.message?.content || '{}'));
    return { correct: typeof parsed.correct === 'boolean' ? parsed.correct : null, confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)), feedback: String(parsed.feedback || ''), cause: String(parsed.cause || ''), nextInstruction: String(parsed.nextInstruction || '') };
  }
}

// Compatibility boundary for legacy screens. The previous implementation read
// another application's credentials and called an unsupported backend endpoint.
// It is intentionally absent from this open-source release. A separate,
// documented SIWC provider can replace this boundary after eligibility review.
export const PROVIDER = 'chatgpt-oauth' as const;
export const DEFAULT_MODEL = 'unavailable';

export type OAuthStatus = {
  linked: boolean;
  auth_mode: string | null;
  last_refresh: string | null;
};

export type ImageInput = {
  data: Buffer;
  mime?: 'image/jpeg' | 'image/png';
  detail?: 'low' | 'high' | 'auto';
};

type Msg = { role: 'user' | 'assistant'; content: string };

export function activeModel(): string { return DEFAULT_MODEL; }
export async function getOAuthStatus(): Promise<OAuthStatus> {
  return { linked: false, auth_mode: null, last_refresh: null };
}

const unavailable = () => new Error('ChatGPT plan usage is not connected. The official SIWC integration has not been installed.');
export async function chat(_messages: Msg[], _maxTokens = 512, _system?: string): Promise<string> {
  throw unavailable();
}
export async function chatStream(_messages: Msg[], _maxTokens: number, _system: string | undefined, _onDelta: (delta: string, total: string) => void): Promise<string> {
  throw unavailable();
}
export async function chatWithImages(_prompt: string, _images: ImageInput[], _maxTokens = 4096, _system?: string): Promise<string> {
  throw unavailable();
}

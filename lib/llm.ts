import * as codex from './codex';

type Msg = { role: 'user' | 'assistant'; content: string };
export type Backend = typeof codex.PROVIDER;

export async function chat(messages: Msg[], maxTokens = 512, system?: string): Promise<string> {
  return codex.chat(messages, maxTokens, system);
}

export async function chatStream(
  messages: Msg[],
  maxTokens: number,
  system: string | undefined,
  onDelta: (delta: string, total: string) => void,
): Promise<string> {
  return codex.chatStream(messages, maxTokens, system, onDelta);
}

export async function chatWithImages(
  prompt: string,
  images: codex.ImageInput[],
  maxTokens = 4096,
  system?: string,
): Promise<string> {
  return codex.chatWithImages(prompt, images, maxTokens, system);
}

export async function currentBackend(): Promise<Backend> {
  return codex.PROVIDER;
}

/**
 * Cude.new - OpenAI model metadata
 *
 * Isolated on purpose. Model families change often, so the classification and
 * capability tables live in one small dependency-free module that is easy to
 * update and easy to test, rather than being spread through the adapter.
 *
 * Nothing here imports a provider SDK or the provider registry.
 */

export interface OpenAIModelListEntry {
  id: string;
  object: string;
}

/**
 * Model families that are not chat-completion endpoints.
 *
 * /v1/models returns every model the key can reach, including audio, realtime,
 * transcription, image and moderation models. The previous filter accepted any
 * id beginning with "gpt-" or "o", so `gpt-4o-realtime-preview`,
 * `gpt-image-1` and `omni-moderation-latest` all reached the model selector and
 * would only fail once the user tried to use them.
 */
const NON_CHAT_MODEL_MARKERS = [
  'audio',
  'realtime',
  'transcribe',
  'tts',
  'whisper',
  'image',
  'dall-e',
  'moderation',
  'embedding',
  'embed',
  'rerank',
  'retriev',
  'guard',
  'safety',
  'bge',
  'esm',
  'search',
  'computer-use',
  'codex-mini', // responses-API only, not a chat-completions model
];

/**
 * True when the id looks like a chat-completions capable model.
 *
 * Stated as an exclusion, not an allowlist. An allowlist of known families is
 * how the selector ended up stuck on gpt-4o: every family released after the
 * list was written was silently dropped, and the same rule has to serve every
 * OpenAI-compatible provider, whose model names Cude cannot enumerate in
 * advance. Anything without a non-chat marker is offered.
 */
export function isChatCompletionModel(id: string): boolean {
  const lower = id.toLowerCase();

  return !NON_CHAT_MODEL_MARKERS.some((marker) => lower.includes(marker));
}

/** Best-known context window for a model id, with a conservative default. */
export function inferContextWindow(id: string): number {
  const lower = id.toLowerCase();

  if (/^o\d/.test(lower) || lower.includes('gpt-4.1') || lower.includes('gpt-5')) {
    return 128000;
  }

  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo') || lower.includes('gpt-4-1106')) {
    return 128000;
  }

  if (lower.includes('gpt-4')) {
    return 8192;
  }

  if (lower.includes('gpt-3.5-turbo')) {
    return 16385;
  }

  return 32000;
}

/** Best-known completion-token ceiling for a model id. */
export function inferMaxCompletionTokens(id: string): number {
  const lower = id.toLowerCase();

  if (lower.startsWith('o1-mini')) {
    return 65536;
  }

  if (/^o[34]/.test(lower)) {
    return 100000;
  }

  if (/^o\d/.test(lower)) {
    return 32768;
  }

  if (lower.includes('gpt-4o')) {
    return 16384;
  }

  if (lower.includes('gpt-4')) {
    return 8192;
  }

  return 4096;
}

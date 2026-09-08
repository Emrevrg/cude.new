/**
 * Cude.new - model discovery regression tests.
 *
 * These exist because the model selector shipped stuck on gpt-4o: the filter
 * was an allowlist of known prefixes, so every family released afterwards was
 * silently dropped, and the discovery cache never expired.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { isChatCompletionModel } from './providers/openai-models';
import { discoverOpenAICompatibleModels, humanizeModelId } from './providers/openai-compatible-models';

afterEach(() => {
  vi.restoreAllMocks();
});

function modelListResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id, object: 'model' })) }),
  } as unknown as Response;
}

describe('forward compatibility', () => {
  it('accepts model families that did not exist when the filter was written', () => {
    for (const id of ['gpt-5', 'gpt-5.6', 'gpt-6-turbo', 'o5-pro', 'grok-5', 'claude-opus-5', 'some-future-model']) {
      expect(isChatCompletionModel(id), id).toBe(true);
    }
  });

  it('still rejects non-chat endpoints regardless of version', () => {
    for (const id of ['gpt-9-audio-preview', 'gpt-7-realtime', 'text-embedding-9', 'dall-e-5']) {
      expect(isChatCompletionModel(id), id).toBe(false);
    }
  });

  it('rejects guard, retrieval and protein models wherever they appear', () => {
    /*
     * Seen live in the picker via OpenRouter's public catalogue
     * (meta-llama/llama-guard-4-12b) and via the registry under NVIDIA
     * (BGE M3, ESMFold, nemoretriever/rerank ids). A guard model answers
     * with a safety verdict, not a conversation.
     */
    for (const id of [
      'meta-llama/llama-guard-4-12b',
      'nvidia/nemotron-3.5-content-safety:free',
      'nvidia/nv-embed-v1',
      'nvidia/rerank-qa-mistral-4b',
      'baai/bge-m3',
      'meta/esmfold',
    ]) {
      expect(isChatCompletionModel(id), id).toBe(false);
    }
  });
});

describe('discoverOpenAICompatibleModels', () => {
  it('maps a provider model list into ModelInfo and drops non-chat entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => modelListResponse(['grok-4', 'grok-5-fast', 'grok-2-image'])),
    );

    const models = await discoverOpenAICompatibleModels({
      url: 'https://api.example.com/v1/models',
      apiKey: 'test-key',
      provider: 'xAI',
      defaultMaxTokens: 131000,
    });

    expect(models.map((m) => m.name)).toEqual(['grok-4', 'grok-5-fast']);
    expect(models[0]).toMatchObject({ provider: 'xAI', maxTokenAllowed: 131000 });
  });

  it('does not offer models already present in the static list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => modelListResponse(['grok-4', 'grok-5'])),
    );

    const models = await discoverOpenAICompatibleModels({
      url: 'https://api.example.com/v1/models',
      apiKey: 'test-key',
      provider: 'xAI',
      knownIds: new Set(['grok-4']),
    });

    expect(models.map((m) => m.name)).toEqual(['grok-5']);
  });

  it('surfaces the HTTP status so the error normalizer can classify it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response),
    );

    await expect(
      discoverOpenAICompatibleModels({
        url: 'https://api.example.com/v1/models',
        apiKey: 'bad-key',
        provider: 'Mistral',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an unexpected response shape rather than throwing a TypeError later', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ foo: 'bar' }) }) as unknown as Response),
    );

    await expect(
      discoverOpenAICompatibleModels({
        url: 'https://api.example.com/v1/models',
        apiKey: 'test-key',
        provider: 'Mistral',
      }),
    ).rejects.toThrow(/unexpected response shape/);
  });

  it('never sends the api key anywhere except the provider endpoint', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => modelListResponse(['m1']));
    vi.stubGlobal('fetch', fetchSpy);

    await discoverOpenAICompatibleModels({
      url: 'https://api.mistral.ai/v1/models',
      apiKey: 'secret-key',
      provider: 'Mistral',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/models');
  });
});

describe('humanizeModelId', () => {
  it('produces a readable label without mangling version numbers', () => {
    expect(humanizeModelId('grok-code-fast-1')).toBe('Grok Code Fast 1');
    expect(humanizeModelId('mistral-large-2411')).toBe('Mistral Large 2411');
  });
});

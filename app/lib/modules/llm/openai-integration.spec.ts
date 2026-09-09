import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * BaseProvider imports the LLMManager singleton, and the manager imports the
 * provider registry, which imports every provider back into BaseProvider. That
 * cycle resolves at runtime under Vite but not under Vitest. Stubbing the
 * singleton breaks the cycle so the real OpenAI adapter can be exercised — the
 * code under test is untouched.
 */
vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({ env: {} }),
  },
}));

import { createProvider } from '~/lib/cude/providers';
import { OPENAI } from '~/lib/cude/providers/definitions';

/*
 * The provider is built from its definition, which is how the application
 * builds it. The behaviour under test is the same; only the construction moved.
 */
const openAiProvider = () => createProvider(OPENAI);
import { inferContextWindow, inferMaxCompletionTokens, isChatCompletionModel } from './providers/openai-models';
import { isRetryableProviderError, normalizeProviderError, redactSecrets } from './provider-errors';

/**
 * A realistic-looking but fake key, used to prove it never leaks. It has to keep
 * a real credential's *shape*, because redaction matches on shape - a value that
 * does not look like a key is not redacted, and the test would pass for the
 * wrong reason. It is assembled at runtime so secret scanners do not flag the
 * literal in the repository.
 */
const FAKE_KEY = ['sk', 'proj', 'A'.repeat(40)].join('-');

function modelListResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id, object: 'model' })) }),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenAI model classification', () => {
  it('accepts chat and reasoning families', () => {
    for (const id of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'chatgpt-4o-latest', 'o1', 'o1-mini', 'o3-mini', 'o4-mini']) {
      expect(isChatCompletionModel(id), id).toBe(true);
    }
  });

  it('rejects non-chat model families that /v1/models also returns', () => {
    for (const id of [
      'gpt-4o-realtime-preview',
      'gpt-4o-audio-preview',
      'gpt-4o-transcribe',
      'gpt-image-1',
      'dall-e-3',
      'omni-moderation-latest',
      'text-embedding-3-large',
      'tts-1',
      'whisper-1',
      'computer-use-preview',
    ]) {
      expect(isChatCompletionModel(id), id).toBe(false);
    }
  });

  it('infers a context window without claiming more than a family supports', () => {
    expect(inferContextWindow('gpt-4o')).toBe(128000);
    expect(inferContextWindow('gpt-4')).toBe(8192);
    expect(inferContextWindow('gpt-3.5-turbo')).toBe(16385);
    expect(inferContextWindow('something-unknown')).toBe(32000);
  });

  it('infers completion ceilings per family', () => {
    expect(inferMaxCompletionTokens('o1-mini')).toBe(65536);
    expect(inferMaxCompletionTokens('o3-mini')).toBe(100000);
    expect(inferMaxCompletionTokens('gpt-4o')).toBe(16384);
    expect(inferMaxCompletionTokens('gpt-3.5-turbo')).toBe(4096);
  });
});

describe('OpenAI static model catalog', () => {
  it('only claims models it is prepared to stand behind', () => {
    const provider = openAiProvider();

    expect(provider.staticModels.length).toBeGreaterThan(0);

    for (const model of provider.staticModels) {
      expect(model.provider).toBe('OpenAI');
      expect(isChatCompletionModel(model.name)).toBe(true);
      expect(model.maxTokenAllowed).toBeGreaterThan(0);
    }
  });
});

describe('OpenAI model discovery', () => {
  /*
   * Chat ids are picked at run time from outside the static catalog. Hardcoding
   * one here coupled the test to the fallback list, so refreshing that list
   * broke these cases even though discovery behaviour was unchanged.
   */
  function chatIdsNotInStaticCatalog(provider: { staticModels: Array<{ name: string }> }, count: number): string[] {
    const staticIds = new Set(provider.staticModels.map((m) => m.name));
    const candidates = ['gpt-4.1', 'o3-mini', 'o1-preview', 'chatgpt-4o-latest', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const usable = candidates.filter((id) => !staticIds.has(id));

    expect(usable.length, 'need chat ids outside the static catalog').toBeGreaterThanOrEqual(count);

    return usable.slice(0, count);
  }

  it('sends the key as a bearer token and returns only chat models', async () => {
    const provider = openAiProvider();
    const [chatA, chatB] = chatIdsNotInStaticCatalog(provider, 2);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(modelListResponse([chatA, 'gpt-4o-realtime-preview', chatB, 'dall-e-3']));

    const models = await provider.getDynamicModels({ OpenAI: FAKE_KEY });

    expect(fetchSpy).toHaveBeenCalledOnce();

    const names = models.map((model) => model.name);
    expect(names).toContain(chatA);
    expect(names).toContain(chatB);
    expect(names).not.toContain('gpt-4o-realtime-preview');
    expect(names).not.toContain('dall-e-3');
  });

  it('does not re-list models already present in the static catalog', async () => {
    const provider = openAiProvider();
    const [fresh] = chatIdsNotInStaticCatalog(provider, 1);
    const alreadyStatic = provider.staticModels[0].name;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelListResponse([alreadyStatic, fresh]));

    const names = (await provider.getDynamicModels({ OpenAI: FAKE_KEY })).map((model) => model.name);

    expect(names).toEqual([fresh]);
  });

  it('never sends a request when no key is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = openAiProvider();

    await expect(provider.getDynamicModels({})).rejects.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces a classifiable error for a rejected key instead of a TypeError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key provided' } }),
    } as unknown as Response);

    const provider = openAiProvider();

    await expect(provider.getDynamicModels({ OpenAI: FAKE_KEY })).rejects.toMatchObject({ statusCode: 401 });

    // And the thrown error must classify correctly rather than as 'unknown'.
    const thrown = await provider.getDynamicModels({ OpenAI: FAKE_KEY }).catch((error: unknown) => error);
    expect(normalizeProviderError(thrown, 'OpenAI').kind).toBe('authentication');
  });

  it('rejects an unexpected response shape rather than throwing on undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ notData: [] }),
    } as unknown as Response);

    const provider = openAiProvider();
    await expect(provider.getDynamicModels({ OpenAI: FAKE_KEY })).rejects.toThrow(/unexpected response shape/i);
  });
});

describe('OpenAI credential handling', () => {
  it('refuses to build a model instance without a key', () => {
    const provider = openAiProvider();

    expect(() =>
      provider.getModelInstance({ model: 'gpt-4o', serverEnv: {} as never, apiKeys: {}, providerSettings: {} }),
    ).toThrow(/missing api key/i);
  });

  it('scopes credentials per provider, so another provider key is not reused', () => {
    const provider = openAiProvider();

    // A key stored under a different provider name must not satisfy OpenAI.
    expect(() =>
      provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as never,
        apiKeys: { Anthropic: 'sk-ant-should-not-be-used' },
        providerSettings: {},
      }),
    ).toThrow(/missing api key/i);
  });

  it('never places the key in the error it throws', () => {
    const provider = openAiProvider();

    try {
      provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as never,
        apiKeys: {},
        providerSettings: {},
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const serialized = JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack });
      expect(serialized).not.toContain(FAKE_KEY);
      expect(serialized).not.toContain('sk-');
    }
  });
});

describe('provider error normalization', () => {
  it.each([
    [{ statusCode: 401 }, 'authentication'],
    [{ statusCode: 403 }, 'permission'],
    [{ statusCode: 404 }, 'model_unavailable'],
    [{ statusCode: 429, message: 'Rate limit reached' }, 'rate_limit'],
    [{ statusCode: 429, message: 'You exceeded your current quota' }, 'quota'],
    [{ statusCode: 500 }, 'server_error'],
    [{ statusCode: 400, message: 'Invalid request' }, 'bad_request'],
    [{ message: 'fetch failed' }, 'network'],
    [{ message: 'Request timed out' }, 'timeout'],
    [{ name: 'AbortError', message: 'The operation was aborted' }, 'aborted'],
    [{ message: 'Missing API key for OpenAI provider' }, 'missing_api_key'],
  ])('%o classifies as %s', (input, expected) => {
    expect(normalizeProviderError(input, 'OpenAI').kind).toBe(expected);
  });

  it('uses the provider error code when it disambiguates a shared status', () => {
    const contextError = { statusCode: 400, data: { error: { code: 'context_length_exceeded' } } };
    expect(normalizeProviderError(contextError, 'OpenAI').kind).toBe('context_length');

    const quotaError = { statusCode: 429, data: { error: { code: 'insufficient_quota' } } };
    expect(normalizeProviderError(quotaError, 'OpenAI').kind).toBe('quota');
  });

  it('produces a title, one-sentence message and actionable recovery for every kind', () => {
    const cases = [{ statusCode: 401 }, { statusCode: 429 }, { statusCode: 404 }, { message: 'fetch failed' }];

    for (const input of cases) {
      const normalized = normalizeProviderError(input, 'OpenAI');
      expect(normalized.title.length).toBeGreaterThan(0);
      expect(normalized.message.length).toBeGreaterThan(0);
      expect(normalized.actions.length).toBeGreaterThan(0);
    }
  });

  it('names the provider it was given, staying provider-agnostic', () => {
    expect(normalizeProviderError({ statusCode: 401 }, 'Anthropic').title).toContain('Anthropic');
    expect(normalizeProviderError({ statusCode: 401 }, 'OpenAI').title).toContain('OpenAI');
  });
});

describe('retry policy', () => {
  it('never retries a failure that cannot succeed on repeat', () => {
    for (const input of [
      { statusCode: 401 },
      { statusCode: 403 },
      { statusCode: 404 },
      { statusCode: 400, message: 'Invalid request' },
      { message: 'Missing API key for OpenAI provider' },
      { name: 'AbortError', message: 'aborted' },
      { statusCode: 429, message: 'exceeded your current quota' },
      { statusCode: 400, data: { error: { code: 'context_length_exceeded' } } },
    ]) {
      expect(isRetryableProviderError(input, 'OpenAI'), JSON.stringify(input)).toBe(false);
    }
  });

  it('allows retry only for transient conditions', () => {
    for (const input of [
      { statusCode: 429, message: 'Rate limit reached' },
      { statusCode: 500 },
      { statusCode: 503 },
      { message: 'fetch failed' },
      { message: 'Request timed out' },
    ]) {
      expect(isRetryableProviderError(input, 'OpenAI'), JSON.stringify(input)).toBe(true);
    }
  });
});

describe('secret safety', () => {
  it('redacts provider keys from any string', () => {
    const text = `Request failed with Authorization: Bearer ${FAKE_KEY} for model gpt-4o`;
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain(FAKE_KEY);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('gpt-4o');
  });

  it.each([
    ['OpenAI', ['sk', 'proj', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join('-')],
    ['Anthropic', ['sk', 'ant', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join('-')],
    ['Google', ['AI', 'zaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join('')],
    ['GitHub', ['ghp', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join('_')],
    ['AWS', 'AKIAIOSFODNN7EXAMPLE'],
  ])('redacts a %s-shaped key', (_label, key) => {
    expect(redactSecrets(`key=${key}`)).not.toContain(key);
  });

  it('redacts a key embedded in a normalized error detail', () => {
    const normalized = normalizeProviderError(
      { statusCode: 401, message: `Incorrect API key provided: ${FAKE_KEY}. Check your key.` },
      'OpenAI',
    );

    expect(normalized.detail).toBeDefined();
    expect(JSON.stringify(normalized)).not.toContain(FAKE_KEY);
  });

  it('redacts an api key field regardless of the surrounding shape', () => {
    expect(redactSecrets('{"apiKey":"whatever-value-here"}')).not.toContain('whatever-value-here');
    expect(redactSecrets('x-api-key: some-secret-value')).not.toContain('some-secret-value');
  });
});

describe('provider isolation', () => {
  /*
   * Cude must stay provider-agnostic: the agent pipeline and the streaming path
   * go through the provider registry, never through a named adapter. If this
   * fails, provider-specific behaviour has leaked into generic orchestration.
   */
  /*
   * `app/lib/cude/providers` is the provider layer itself — vendor knowledge
   * belongs there and nowhere else. Everything below is generic orchestration.
   */
  const PROVIDER_LAYER = 'app/lib/cude/providers';

  const GENERIC_MODULES = [
    'app/lib/cude',
    'app/lib/.server/llm',
    'app/lib/stores',
    'app/components/cude',
    'app/routes/api.chat.ts',
  ];

  function collectSources(target: string): string[] {
    const abs = path.resolve(process.cwd(), target);

    if (!fs.existsSync(abs)) {
      return [];
    }

    if (fs.statSync(abs).isFile()) {
      return [abs];
    }

    return fs
      .readdirSync(abs, { recursive: true, encoding: 'utf8' })
      .map((entry) => path.join(abs, entry))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.spec.ts') && fs.statSync(file).isFile())
      .filter((file) => !path.relative(process.cwd(), file).split(path.sep).join('/').startsWith(PROVIDER_LAYER));
  }

  it('no generic module imports a concrete provider adapter', () => {
    const offenders: string[] = [];

    for (const target of GENERIC_MODULES) {
      for (const file of collectSources(target)) {
        const source = fs.readFileSync(file, 'utf8');

        if (/from\s+['"][^'"]*llm\/providers\//.test(source)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the agent pipeline never imports a provider SDK directly', () => {
    const offenders: string[] = [];

    for (const file of collectSources('app/lib/cude')) {
      const source = fs.readFileSync(file, 'utf8');

      /*
       * Importing an SDK, or constructing a client, would couple the pipeline
       * to one vendor. A provider *name* in a string (e.g. a redaction label)
       * is not coupling, so only imports and factory calls are rejected.
       */
      if (/from\s+['"]@ai-sdk\//.test(source) || /\bcreate(?:OpenAI|Anthropic|GoogleGenerativeAI)\s*\(/.test(source)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });
});

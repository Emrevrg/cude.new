/**
 * Cude.new — the provider layer.
 *
 * Twenty-one providers built from declarations. The point of the tests is that
 * a mistake in one declaration cannot ship quietly: a missing key variable, a
 * model listed under the wrong provider, or a catalogue entry with no context
 * window all break a provider in a way nobody notices until someone tries to
 * use it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: { getInstance: () => ({ env: {} }) },
}));

import { PROVIDER_DEFINITIONS } from './definitions';
import { REGISTRY_TO_PROVIDER } from './modelRegistry';
import { createProvider, PROVIDER_CLASSES } from './index';
import { isNotConfigured, ProviderNotConfiguredError } from './defineProvider';

const FAKE_KEY = 'sk-test-AAAAAAAAAAAAAAAAAAAAAAAA';

afterEach(() => {
  vi.restoreAllMocks();
});

function modelList(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id, object: 'model' })) }),
  } as unknown as Response;
}

describe('the catalogue', () => {
  it('registers every provider exactly once', () => {
    const names = PROVIDER_DEFINITIONS.map((definition) => definition.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('builds a class for each definition, plus the bespoke one', () => {
    expect(PROVIDER_CLASSES.length).toBe(PROVIDER_DEFINITIONS.length + 1);
  });

  it('gives every hosted provider somewhere to get a key', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      if (definition.local) {
        continue;
      }

      expect(definition.apiTokenKey, definition.name).toBeTruthy();
      expect(definition.getApiKeyLink, definition.name).toMatch(/^https:\/\//);
    }
  });

  it('gives every local provider an address instead of a key', () => {
    for (const definition of PROVIDER_DEFINITIONS.filter((entry) => entry.local)) {
      expect(definition.baseUrlKey, definition.name).toBeTruthy();
    }
  });
});

describe('the model catalogues', () => {
  it('attributes every model to the provider that publishes it', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      for (const model of definition.staticModels) {
        expect(model.provider, `${definition.name} / ${model.name}`).toBe(definition.name);
      }
    }
  });

  it('gives every model a usable context window', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      for (const model of definition.staticModels) {
        expect(model.maxTokenAllowed, `${definition.name} / ${model.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('does not list the same model twice within one provider', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const names = definition.staticModels.map((model) => model.name);

      expect(new Set(names).size, definition.name).toBe(names.length);
    }
  });

  it('describes every provider in its own words', () => {
    /*
     * The settings list reads these. Fifteen of eighteen cards once said
     * "Standard AI provider integration", which told nobody anything about
     * which provider they wanted.
     */
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(definition.description?.length, definition.name).toBeGreaterThan(20);
    }
  });

  it('does not describe two providers the same way', () => {
    const descriptions = PROVIDER_DEFINITIONS.map((definition) => definition.description);

    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('gives every model a label a person can read', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      for (const model of definition.staticModels) {
        expect(model.label?.length, `${definition.name} / ${model.name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('a provider without a key', () => {
  const hosted = PROVIDER_DEFINITIONS.find((definition) => !definition.local && definition.discovery)!;

  it('refuses to build a model instance', () => {
    const provider = createProvider(hosted);

    expect(() =>
      provider.getModelInstance({ model: 'any', serverEnv: {} as never, apiKeys: {}, providerSettings: {} }),
    ).toThrow(/missing api key/i);
  });

  it('reports "not configured" rather than a failure', async () => {
    const provider = createProvider(hosted);
    const error = await provider.getDynamicModels({}).catch((thrown: unknown) => thrown);

    expect(isNotConfigured(error)).toBe(true);
  });

  it('asks nothing of the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = createProvider(hosted);

    await provider.getDynamicModels({}).catch(() => undefined);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never puts the key it was given into the error', () => {
    const provider = createProvider(hosted);

    try {
      provider.getModelInstance({
        model: 'any',
        serverEnv: {} as never,
        apiKeys: { SomeOtherProvider: FAKE_KEY },
        providerSettings: {},
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(FAKE_KEY);
    }
  });
});

describe('discovery', () => {
  const anthropic = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'Anthropic')!;
  const openai = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'OpenAI')!;

  it('does not offer a model the static catalogue already lists', async () => {
    const provider = createProvider(openai);
    const alreadyKnown = openai.staticModels[0].name;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelList([alreadyKnown, 'gpt-4-turbo']));

    const names = (await provider.getDynamicModels({ OpenAI: FAKE_KEY })).map((model) => model.name);

    expect(names).not.toContain(alreadyKnown);
    expect(names).toContain('gpt-4-turbo');
  });

  it('drops the non-chat models an endpoint also returns', async () => {
    const provider = createProvider(openai);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelList(['gpt-4-turbo', 'text-embedding-3-large', 'dall-e-3']));

    const names = (await provider.getDynamicModels({ OpenAI: FAKE_KEY })).map((model) => model.name);

    expect(names).toEqual(['gpt-4-turbo']);
  });

  it('reads a provider that answers in its own shape', async () => {
    const provider = createProvider(anthropic);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'claude-test-1', display_name: 'Claude Test' }] }),
    } as unknown as Response);

    const models = await provider.getDynamicModels({ Anthropic: FAKE_KEY });

    expect(models[0]).toMatchObject({ name: 'claude-test-1', label: 'Claude Test', provider: 'Anthropic' });
  });

  it('offers a model nobody wrote down — which is how a new release arrives', async () => {
    /*
     * The point of discovery. A catalogue in the source is out of date the day
     * a vendor ships something, so anything the provider reports and Cude has
     * never heard of has to come through.
     */
    const provider = createProvider(openai);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelList(['gpt-9-turbo-unreleased']));

    const names = (await provider.getDynamicModels({ OpenAI: FAKE_KEY })).map((model) => model.name);

    expect(names).toContain('gpt-9-turbo-unreleased');
  });

  it('drops the guard models a public catalogue also returns', async () => {
    /*
     * Seen live: OpenRouter publishes meta-llama/llama-guard-4-12b next to
     * its chat models, and its custom parser had no filter — so a model that
     * answers with a safety verdict sat in the picker. The shared filter now
     * applies no matter who parsed the response.
     */
    const openrouter = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'OpenRouter')!;
    const provider = createProvider(openrouter);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', context_length: 1000000 },
          { id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4 12B', context_length: 128000 },
        ],
      }),
    } as unknown as Response);

    const names = (await provider.getDynamicModels({})).map((model) => model.name);

    expect(names).toContain('meta-llama/llama-4-maverick');
    expect(names).not.toContain('meta-llama/llama-guard-4-12b');
  });

  it('reads a provider that answers with its own field names', async () => {
    const cohere = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'Cohere')!;
    const provider = createProvider(cohere);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'command-r-next', endpoints: ['chat'], context_length: 128000 },
          { name: 'embed-english-v3', endpoints: ['embed'] },
        ],
      }),
    } as unknown as Response);

    const models = await provider.getDynamicModels({ Cohere: FAKE_KEY });

    expect(models.map((model) => model.name)).toEqual(['command-r-next']);
    expect(models[0].maxTokenAllowed).toBe(128000);
  });

  it('carries the status forward so a rejected key can be classified', async () => {
    const provider = createProvider(anthropic);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as unknown as Response);

    await expect(provider.getDynamicModels({ Anthropic: FAKE_KEY })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('catalogues that need no key', () => {
  const openrouter = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'OpenRouter')!;

  it('reads OpenRouter without one', async () => {
    /*
     * OpenRouter publishes its whole catalogue to anybody. Requiring a key
     * first meant a person saw nine hand-written entries instead of the four
     * hundred that are actually on offer.
     */
    const provider = createProvider(openrouter);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'anthropic/claude-fable-5.1', name: 'Anthropic: Claude Fable 5.1', context_length: 1000000 },
          { id: 'some/model-released-today', name: 'Something New', context_length: 32000 },
        ],
      }),
    } as unknown as Response);

    const models = await provider.getDynamicModels({});

    expect(models.map((model) => model.name)).toContain('some/model-released-today');
    expect(models[0].label).toBe('Anthropic: Claude Fable 5.1');
  });

  it('keeps the context window the catalogue reports, rather than guessing', async () => {
    const provider = createProvider(openrouter);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'big/model', name: 'Big', context_length: 1000000 }] }),
    } as unknown as Response);

    expect((await provider.getDynamicModels({}))[0].maxTokenAllowed).toBe(1000000);
  });

  it('still asks for a key where the catalogue is not public', async () => {
    const anthropic = PROVIDER_DEFINITIONS.find((definition) => definition.name === 'Anthropic')!;
    const error = await createProvider(anthropic)
      .getDynamicModels({})
      .catch((thrown: unknown) => thrown);

    expect(isNotConfigured(error)).toBe(true);
  });
});

describe('every provider is completely specified', () => {
  /*
   * Written after a provider was added to the file and left out of the array —
   * defined, exported, and dead. These check the things that make a provider
   * usable rather than merely present.
   */
  it.each(PROVIDER_DEFINITIONS.map((definition) => [definition.name, definition] as const))(
    '%s is usable',
    (name, definition) => {
      expect(definition.name, 'name').toBeTruthy();
      expect(definition.description?.length, 'description').toBeGreaterThan(20);
      expect(typeof definition.client, 'client').toBe('function');

      // Either it can be reached without credentials, or it says where to get them.
      if (!definition.local) {
        expect(definition.apiTokenKey, `${name} needs a key variable`).toBeTruthy();
        expect(definition.getApiKeyLink, `${name} needs somewhere to get a key`).toMatch(/^https:\/\//);
      } else {
        expect(definition.baseUrlKey ?? definition.baseUrl, `${name} needs an address`).toBeTruthy();
      }

      // Either it ships models, or it can be asked for them.
      expect(definition.staticModels.length > 0 || Boolean(definition.discovery), `${name} offers nothing`).toBe(true);

      for (const model of definition.staticModels) {
        expect(model.provider, `${name}: ${model.name} is attributed elsewhere`).toBe(name);
        expect(model.maxTokenAllowed, `${name}: ${model.name} context`).toBeGreaterThan(0);
        expect(model.label?.length, `${name}: ${model.name} label`).toBeGreaterThan(0);
      }
    },
  );

  it('gives every provider a distinct key variable', () => {
    const keys = PROVIDER_DEFINITIONS.map((definition) => definition.apiTokenKey).filter(Boolean);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every provider a distinct base URL variable', () => {
    const keys = PROVIDER_DEFINITIONS.map((definition) => definition.baseUrlKey).filter(Boolean);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every discovery endpoint at a real address', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const url = definition.discovery?.url;

      if (typeof url === 'string') {
        expect(() => new URL(url), definition.name).not.toThrow();
        expect(url.startsWith('https://') || url.startsWith('http://'), definition.name).toBe(true);
      }
    }
  });

  /*
   * Every key variable a provider reads has to appear in .env.example.
   *
   * Twenty of them did not. A provider declares `NVIDIA_API_KEY`, the settings
   * screen reads it, and somebody deploying from the example file — a Docker
   * image, a Cloudflare project, where there is no settings screen to paste
   * into — has no way to learn the name exists. The provider is shipped and
   * unreachable.
   */
  it('documents every key variable in .env.example', () => {
    const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const documented = new Set([...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]));

    const undocumented = PROVIDER_DEFINITIONS.flatMap((definition) =>
      [definition.apiTokenKey, definition.baseUrlKey]
        .filter((key): key is string => Boolean(key))
        .filter((key) => !documented.has(key))
        .map((key) => `${definition.name} reads ${key}`),
    );

    expect(undocumented).toEqual([]);
  });

  it('builds a working client for every one of them', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(
        () => definition.client({ apiKey: 'test-key', baseURL: definition.baseUrl ?? 'https://example.com/v1' }),
        definition.name,
      ).not.toThrow();
    }
  });
});

describe('what a fresh install opens on', () => {
  const first = PROVIDER_DEFINITIONS[0];

  it('offers models before anything is configured', () => {
    /*
     * The first entry is what a new install selects. Adding sixteen providers
     * to the front of this list once made that Azure, which has no models
     * until someone supplies a resource URL — so the very first screen showed
     * an empty picker.
     */
    expect(first.staticModels.length).toBeGreaterThan(0);
  });

  it('does not need a base URL to be useful', () => {
    expect(first.baseUrlKey).toBeUndefined();
  });

  it('keeps the well-known providers at the top, where people look', () => {
    const top = PROVIDER_DEFINITIONS.slice(0, 6).map((definition) => definition.name);

    expect(top).toContain('Anthropic');
    expect(top).toContain('OpenAI');
  });

  it('gives every provider that needs no address something to show', () => {
    const empty = PROVIDER_DEFINITIONS.filter(
      (definition) => !definition.local && !definition.baseUrlKey && definition.staticModels.length === 0,
    ).map((definition) => definition.name);

    /*
     * A provider with no static models and no address is a dead entry until a
     * key is pasted — unless something else can fill its list without one.
     * Two things can: a public catalogue of its own, or the model registry.
     *
     * NVIDIA is the case that matters. It had a hand-written catalogue and
     * NVIDIA answered 410 Gone for most of it, because the ids came from
     * documentation and the models had been retired. An empty list that the
     * registry fills is better than a written one that is wrong.
     */
    const allowed = [
      ...PROVIDER_DEFINITIONS.filter((definition) => definition.discovery?.public).map((definition) => definition.name),
      ...Object.values(REGISTRY_TO_PROVIDER),
    ];

    expect(empty.filter((name) => !allowed.includes(name))).toEqual([]);
  });
});

describe('the providers on offer', () => {
  it('includes NVIDIA, which was defined and never registered', () => {
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.name)).toContain('NVIDIA');
  });

  it('registers every definition that the file exports', () => {
    /*
     * NVIDIA existed as a definition but was left out of the array, so it was
     * dead code: never registered, never listed, never usable.
     */
    const names = PROVIDER_DEFINITIONS.map((definition) => definition.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(22);
  });
});

describe('asking a provider what it has', () => {
  it('is something every provider can do', () => {
    /*
     * A provider without discovery is frozen at whatever was written here, so
     * a new model from that vendor never appears. Two were missing when this
     * was written; the test is here so it does not happen again quietly.
     */
    const silent = PROVIDER_DEFINITIONS.filter((definition) => !definition.discovery).map(
      (definition) => definition.name,
    );

    expect(silent).toEqual([]);
  });
});

describe('local providers', () => {
  const local = PROVIDER_DEFINITIONS.filter((definition) => definition.local);

  it('never reports a local provider as missing a key', async () => {
    for (const definition of local) {
      const provider = createProvider(definition);

      // Unreachable, because nothing is listening in a test run.
      const error = await provider.getDynamicModels({}).catch((thrown: unknown) => thrown);

      expect(isNotConfigured(error), definition.name).toBe(false);
    }
  });

  it('asks nothing when it has no address at all', async () => {
    const addressless = local.filter((definition) => !definition.baseUrl);

    for (const definition of addressless) {
      // A developer machine may well have an address for these in its own env.
      const envKey = definition.baseUrlKey!;
      const configured = process.env[envKey];
      delete process.env[envKey];

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const provider = createProvider(definition);

      try {
        await expect(provider.getDynamicModels({}), definition.name).resolves.toEqual([]);
        expect(fetchSpy, definition.name).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();

        if (configured !== undefined) {
          process.env[envKey] = configured;
        }
      }
    }
  });

  it('builds a model instance without a key', () => {
    for (const definition of local) {
      const provider = createProvider(definition);

      expect(() =>
        provider.getModelInstance({
          model: 'any',
          serverEnv: { [definition.baseUrlKey!]: 'http://127.0.0.1:1234' } as never,
          apiKeys: {},
          providerSettings: {},
        }),
      ).not.toThrow();
    }
  });
});

describe('the not-configured signal', () => {
  it('recognises its own error', () => {
    expect(isNotConfigured(new ProviderNotConfiguredError('Example'))).toBe(true);
  });

  it('does not mistake an ordinary failure for it', () => {
    expect(isNotConfigured(new Error('network down'))).toBe(false);
    expect(isNotConfigured(undefined)).toBe(false);
  });

  it('names the provider, so the message is actionable', () => {
    expect(new ProviderNotConfiguredError('Example').message).toContain('Example');
  });
});

/**
 * Cude.new — the public model registry.
 *
 * This is what makes the picker current without a key. A provider answers 401
 * to an anonymous request, so before the registry the only models on offer
 * were the handful written into the source — stale the day a vendor ships.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  REGISTRY_TO_PROVIDER,
  fetchModelRegistry,
  mergeRegistryModels,
  readRegistry,
  resetRegistryCache,
} from './modelRegistry';
import { PROVIDER_DEFINITIONS } from './definitions';

const SAMPLE = {
  anthropic: {
    name: 'Anthropic',
    models: {
      'claude-opus-5': {
        id: 'claude-opus-5',
        name: 'Claude Opus 5',
        limit: { context: 1000000, output: 128000 },
        modalities: { input: ['text'], output: ['text'] },
      },
      'claude-fable-5-1': {
        id: 'claude-fable-5-1',
        name: 'Claude Fable 5.1',
        limit: { context: 200000, output: 64000 },
        modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
  xai: {
    name: 'xAI',
    models: {
      'grok-4.6': {
        id: 'grok-4.6',
        name: 'Grok 4.6',
        limit: { context: 256000 },
        modalities: { input: ['text'], output: ['text'] },
      },
      'grok-imagine-video': {
        id: 'grok-imagine-video',
        name: 'Grok Imagine Video',
        modalities: { input: ['text'], output: ['video'] },
      },
    },
  },
  'some-vendor-cude-does-not-have': {
    name: 'Nobody',
    models: { 'a-model': { id: 'a-model', name: 'A Model' } },
  },
};

beforeEach(() => {
  resetRegistryCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRegistryCache();
});

describe('reading the registry', () => {
  it('groups models under the provider Cude knows', () => {
    const byProvider = readRegistry(SAMPLE);

    expect([...byProvider.keys()].sort()).toEqual(['Anthropic', 'xAI']);
  });

  it('keeps the ids the registry reports, which are the ones that work', () => {
    /*
     * The point of reading a registry rather than guessing: xAI's model is
     * `grok-4.6`, not `grok-4-6`, and a guessed id fails at the moment of use.
     */
    const names = readRegistry(SAMPLE)
      .get('xAI')!
      .map((model) => model.name);

    expect(names).toContain('grok-4.6');
    expect(names).not.toContain('grok-4-6');
  });

  it('keeps the context and output limits it reports', () => {
    const opus = readRegistry(SAMPLE)
      .get('Anthropic')!
      .find((model) => model.name === 'claude-opus-5')!;

    expect(opus.maxTokenAllowed).toBe(1000000);
    expect(opus.maxCompletionTokens).toBe(128000);
  });

  it('leaves out anything that cannot answer in text', () => {
    const names = readRegistry(SAMPLE)
      .get('xAI')!
      .map((model) => model.name);

    expect(names).not.toContain('grok-imagine-video');
  });

  it('leaves out embedding and protein models that claim a text shape', () => {
    /*
     * models.dev lists these as text→text with chat-like descriptions, so
     * neither the modalities nor the prose can be trusted — only the family
     * name and the id say what they are. Seen live under NVIDIA: BGE M3,
     * ESM2 and ESMFold all sat in the chat picker.
     */
    const models = readRegistry({
      nvidia: {
        models: {
          'baai/bge-m3': { id: 'baai/bge-m3', name: 'BGE M3', family: 'bge' },
          'meta/esm2-650m': { id: 'meta/esm2-650m', name: 'esm2-650m', family: 'esm' },
          'meta/esmfold': { id: 'meta/esmfold', name: 'esmfold' },
        },
      },
    }).get('NVIDIA');

    expect(models ?? []).toEqual([]);
  });

  it('leaves out models that take no text in', () => {
    /* A vision or video model cannot take part in a text conversation. */
    const models = readRegistry({
      nvidia: {
        models: {
          'nvidia/bevformer': {
            id: 'nvidia/bevformer',
            name: 'bevformer',
            modalities: { input: ['video'], output: ['text'] },
          },
        },
      },
    }).get('NVIDIA');

    expect(models ?? []).toEqual([]);
  });

  it('drops providers Cude has nothing to send to', () => {
    expect(readRegistry(SAMPLE).has('Nobody')).toBe(false);
  });

  it('survives a registry that is empty, malformed or missing', () => {
    expect(readRegistry(null).size).toBe(0);
    expect(readRegistry({}).size).toBe(0);
    expect(readRegistry({ anthropic: {} }).size).toBe(0);
    expect(readRegistry({ anthropic: { models: null } } as never).size).toBe(0);
  });

  it('gives a model with no stated context a usable one anyway', () => {
    const models = readRegistry({
      anthropic: { models: { x: { id: 'x', name: 'X' } } },
    }).get('Anthropic')!;

    expect(models[0].maxTokenAllowed).toBeGreaterThan(0);
  });
});

describe('merging with what is already known', () => {
  const existing = [{ name: 'claude-opus-5', label: 'Hand written', provider: 'Anthropic', maxTokenAllowed: 200000 }];

  it('adds the models nobody had', () => {
    const merged = mergeRegistryModels(existing, readRegistry(SAMPLE));

    expect(merged.map((model) => model.name)).toContain('claude-fable-5-1');
  });

  it('does not list the same model twice', () => {
    const merged = mergeRegistryModels(existing, readRegistry(SAMPLE));
    const keys = merged.map((model) => `${model.provider}:${model.name}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lets what was already there win', () => {
    /* A hand-checked entry, or one the provider itself reported, is better. */
    const merged = mergeRegistryModels(existing, readRegistry(SAMPLE));
    const opus = merged.find((model) => model.name === 'claude-opus-5')!;

    expect(opus.label).toBe('Hand written');
  });

  it('gives a discovered model the published name and the real context window', () => {
    /*
     * A provider's /models endpoint returns an id and nothing else, so the
     * label is generated from the id and the window is a house default.
     * NVIDIA's Kimi K3 came through as "Moonshotai/kimi K3" with 32k, when the
     * registry knows its published name and its actual limit.
     */
    const discovered = [
      { name: 'claude-opus-5', label: 'Claude-opus 5', provider: 'Anthropic', maxTokenAllowed: 32000 },
    ];

    const merged = mergeRegistryModels(discovered, readRegistry(SAMPLE));
    const opus = merged.find((model) => model.name === 'claude-opus-5')!;

    expect(opus.label).toBe('Claude Opus 5');
    expect(opus.maxTokenAllowed).toBe(1000000);
  });

  it('tells the send path what kind of model it is', () => {
    /*
     * The one that mattered live. NVIDIA's /models returns an id and nothing
     * else, so Kimi K3 arrived with the house default context and no idea it
     * reasons — and the send path then used a 32k limit on a model with a
     * million, and the parameters for a model that does not reason. The
     * picker, which merges the registry, was showing the truth the whole time;
     * the two disagreed about the same model.
     */
    const discovered = [
      { name: 'moonshotai/kimi-k3', label: 'Moonshot AI Kimi K3', provider: 'NVIDIA', maxTokenAllowed: 32000 },
    ];
    const registry = new Map([
      [
        'NVIDIA',
        [
          {
            name: 'moonshotai/kimi-k3',
            label: 'Kimi K3',
            provider: 'NVIDIA',
            maxTokenAllowed: 1048576,
            maxCompletionTokens: 65536,
            reasoning: true,
            toolCall: true,
          },
        ],
      ],
    ]);

    const [merged] = mergeRegistryModels(discovered, registry);

    expect(merged.reasoning, 'reasoning').toBe(true);
    expect(merged.toolCall, 'tool calling').toBe(true);
    expect(merged.maxTokenAllowed, 'context window').toBe(1048576);
    expect(merged.maxCompletionTokens, 'output limit').toBe(65536);
  });

  it('does not overrule what a provider said about itself', () => {
    // A model the provider reported as not reasoning stays that way.
    const discovered = [
      { name: 'x/y', label: 'Y', provider: 'NVIDIA', maxTokenAllowed: 8000, reasoning: false, toolCall: false },
    ];
    const registry = new Map([
      ['NVIDIA', [{ name: 'x/y', label: 'Y', provider: 'NVIDIA', maxTokenAllowed: 8000, reasoning: true }]],
    ]);

    expect(mergeRegistryModels(discovered, registry)[0].reasoning).toBe(false);
  });

  it('never shrinks the output limit either', () => {
    /*
     * The same rule as the context window, and it was the one line that did
     * not follow it. A discovered model carries a house default because the
     * provider's /models endpoint returns an id and nothing else; `??` treated
     * that default as knowledge and kept it. Every OpenRouter model was capped
     * at 4096 output tokens while the registry knew the real figure was half a
     * million — not enough to write one HTML file, so a follow-up asking for a
     * change came back as a long explanation with the file missing.
     */
    const discovered = [
      {
        name: 'minimax/minimax-m3',
        label: 'MiniMax M3',
        provider: 'OpenRouter',
        maxTokenAllowed: 8000,
        maxCompletionTokens: 4096,
      },
    ];
    const registry = new Map([
      [
        'OpenRouter',
        [
          {
            name: 'minimax/minimax-m3',
            label: 'MiniMax M3',
            provider: 'OpenRouter',
            maxTokenAllowed: 1048576,
            maxCompletionTokens: 512000,
          },
        ],
      ],
    ]);

    const [merged] = mergeRegistryModels(discovered, registry);

    expect(merged.maxCompletionTokens).toBe(512000);
    expect(merged.maxTokenAllowed).toBe(1048576);
  });

  it('keeps a hand-checked limit when the registry has none', () => {
    const discovered = [
      { name: 'x/y', label: 'Y', provider: 'OpenRouter', maxTokenAllowed: 8000, maxCompletionTokens: 4096 },
    ];
    const registry = new Map([
      ['OpenRouter', [{ name: 'x/y', label: 'Y', provider: 'OpenRouter', maxTokenAllowed: 8000 }]],
    ]);

    expect(mergeRegistryModels(discovered, registry)[0].maxCompletionTokens).toBe(4096);
  });

  it('never shrinks a context window it was already given', () => {
    const generous = [{ name: 'claude-fable-5-1', label: 'Fable', provider: 'Anthropic', maxTokenAllowed: 500000 }];

    const merged = mergeRegistryModels(generous, readRegistry(SAMPLE));

    expect(merged.find((model) => model.name === 'claude-fable-5-1')!.maxTokenAllowed).toBe(500000);
  });

  it('keeps a label somebody wrote by hand', () => {
    const named = [{ name: 'claude-opus-5', label: 'Our house model', provider: 'Anthropic', maxTokenAllowed: 200000 }];

    const merged = mergeRegistryModels(named, readRegistry(SAMPLE));

    expect(merged.find((model) => model.name === 'claude-opus-5')!.label).toBe('Our house model');
  });

  it('returns the original list when the registry gave nothing', () => {
    expect(mergeRegistryModels(existing, new Map())).toEqual(existing);
  });
});

describe('fetching it', () => {
  it('asks once and reuses the answer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    } as unknown as Response);

    await fetchModelRegistry();
    await fetchModelRegistry();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shares one request between callers that arrive together', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    } as unknown as Response);

    await Promise.all([fetchModelRegistry(), fetchModelRegistry(), fetchModelRegistry()]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('gives back an empty registry rather than throwing when it cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(fetchModelRegistry()).resolves.toEqual(new Map());
  });

  it('treats an unhappy response as no registry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

    await expect(fetchModelRegistry()).resolves.toEqual(new Map());
  });
});

describe('the mapping', () => {
  it('names only providers this build actually has', () => {
    const ours = new Set(PROVIDER_DEFINITIONS.map((definition) => definition.name));
    const unknown = Object.values(REGISTRY_TO_PROVIDER).filter((name) => !ours.has(name));

    expect(unknown).toEqual([]);
  });

  it('does not point two registry ids at the same provider', () => {
    const targets = Object.values(REGISTRY_TO_PROVIDER);

    expect(new Set(targets).size).toBe(targets.length);
  });

  it('covers the providers people actually reach for', () => {
    for (const name of ['Anthropic', 'OpenAI', 'NVIDIA', 'Google', 'Groq', 'Mistral', 'xAI']) {
      expect(Object.values(REGISTRY_TO_PROVIDER), name).toContain(name);
    }
  });
});

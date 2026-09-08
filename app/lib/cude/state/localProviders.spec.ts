/**
 * Cude.new - local model servers.
 *
 * The interesting cases are the ones a hosted provider never has: nothing is
 * listening, something is listening but is not what we expected, and the user
 * changed the address while a check was still in flight.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LocalProviders,
  describeLocalProvider,
  normalizeBaseUrl,
  formatSize,
  LOCAL_PROVIDER_DESCRIPTORS,
} from './localProviders';
import { LOCAL_PROVIDERS } from '~/lib/cude/state/settings';

let providers: LocalProviders;
let calls: string[] = [];

function respond(handler: (url: string) => { ok: boolean; body?: unknown; status?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);

      if (init?.signal?.aborted) {
        throw new Error('aborted');
      }

      const result = handler(url);

      return {
        ok: result.ok,
        status: result.status ?? (result.ok ? 200 : 500),
        json: async () => result.body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  calls = [];
  providers = new LocalProviders();
});

afterEach(() => {
  providers.dispose();
  vi.unstubAllGlobals();
});

describe('addresses', () => {
  it('treats a trailing slash as the same address', () => {
    expect(normalizeBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  http://localhost:1234  ')).toBe('http://localhost:1234');
  });
});

describe('the descriptors', () => {
  it('covers the servers a person actually runs', () => {
    const ids = LOCAL_PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id);

    // The desktop apps, the two servers, the proxy, and the catch-all.
    expect(ids).toEqual(expect.arrayContaining(['Ollama', 'LMStudio', 'vLLM', 'llama.cpp', 'Jan', 'LiteLLM']));

    // The catch-all goes last: it is what you reach for when nothing else fits.
    expect(ids.at(-1)).toBe('OpenAILike');
  });

  it('describes each one distinctly', () => {
    const ids = LOCAL_PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id);
    const urls = LOCAL_PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.defaultBaseUrl);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size, 'two servers cannot default to the same port').toBe(urls.length);
  });

  it('matches the providers that declare themselves local', () => {
    /*
     * The two lists are written separately — one describes how to reach a
     * server, the other how to talk to it — so they can drift. vLLM, llama.cpp,
     * Jan and LiteLLM were in one and not the other, which put them under
     * Cloud Providers next to the ones that bill you.
     */
    const described = new Set(LOCAL_PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id));

    for (const name of LOCAL_PROVIDERS) {
      expect(described.has(name as never), `${name} declares itself local but is not described`).toBe(true);
    }
  });

  it('gives each one setup steps, because the failure mode is "not installed"', () => {
    for (const descriptor of LOCAL_PROVIDER_DESCRIPTORS) {
      expect(descriptor.setup.length).toBeGreaterThan(0);
      expect(descriptor.defaultBaseUrl).toMatch(/^http/);
    }
  });
});

describe('checking Ollama', () => {
  it('reports it running and lists its models', async () => {
    respond((url) =>
      url.endsWith('/api/tags')
        ? { ok: true, body: { models: [{ name: 'qwen2.5-coder', size: 4_700_000_000 }] } }
        : { ok: true, body: { version: '0.5.1' } },
    );

    expect(await providers.check('Ollama', 'http://localhost:11434')).toBe('running');
    expect(providers.get('Ollama').models).toEqual([{ name: 'qwen2.5-coder', size: 4_700_000_000 }]);
    expect(providers.get('Ollama').version).toBe('0.5.1');
  });

  it('is still running when it has no version endpoint', async () => {
    respond((url) => (url.endsWith('/api/tags') ? { ok: true, body: { models: [] } } : { ok: false, status: 404 }));

    expect(await providers.check('Ollama', 'http://localhost:11434')).toBe('running');
    expect(providers.get('Ollama').version).toBeUndefined();
  });

  it('reports unreachable when nothing answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    expect(await providers.check('Ollama', 'http://localhost:11434')).toBe('unreachable');
    expect(providers.get('Ollama').error).toContain('ECONNREFUSED');
  });

  it('reports unreachable when something answers with an error', async () => {
    respond(() => ({ ok: false, status: 502 }));

    expect(await providers.check('Ollama', 'http://localhost:11434')).toBe('unreachable');
    expect(providers.get('Ollama').error).toContain('502');
  });
});

describe('checking the OpenAI-compatible servers', () => {
  it('reads LM Studio’s model list', async () => {
    respond(() => ({ ok: true, body: { data: [{ id: 'llama-3.2-3b' }] } }));

    await providers.check('LMStudio', 'http://localhost:1234');

    expect(calls[0]).toBe('http://localhost:1234/v1/models');
    expect(providers.get('LMStudio').models).toEqual([{ name: 'llama-3.2-3b' }]);
  });

  it('asks an OpenAI-compatible server for /models at the URL given', async () => {
    respond(() => ({ ok: true, body: { data: [] } }));

    await providers.check('OpenAILike', 'http://localhost:8000/v1/');

    expect(calls[0]).toBe('http://localhost:8000/v1/models');
  });

  it('copes with a server that returns no data array', async () => {
    respond(() => ({ ok: true, body: {} }));

    expect(await providers.check('LMStudio', 'http://localhost:1234')).toBe('running');
    expect(providers.get('LMStudio').models).toEqual([]);
  });
});

describe('empty and unknown', () => {
  it('says so when no address is set rather than checking nothing', async () => {
    expect(await providers.check('Ollama', '   ')).toBe('unknown');
    expect(providers.get('Ollama').error).toMatch(/no address/i);
    expect(calls).toHaveLength(0);
  });

  it('ignores a provider it does not know', async () => {
    expect(await providers.check('Nonsense' as never, 'http://x')).toBe('unknown');
  });

  it('starts every provider in an unknown state', () => {
    expect(providers.get('Ollama')).toMatchObject({ reachability: 'unknown', models: [] });
  });
});

describe('a check that was superseded', () => {
  it('does not overwrite the newer answer', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise((resolve, reject) => {
            if (calls.push(url) === 1) {
              resolveFirst = reject;
              return;
            }

            resolve({ ok: true, status: 200, json: async () => ({ models: [{ name: 'second' }] }) } as Response);
          }),
      ),
    );

    const first = providers.check('Ollama', 'http://localhost:11434');
    const second = providers.check('Ollama', 'http://localhost:11435');

    resolveFirst?.(new Error('aborted'));
    await Promise.all([first, second]);

    expect(providers.get('Ollama').models).toEqual([{ name: 'second' }]);
  });
});

describe('sizes', () => {
  it('reports gigabytes for a model-sized file', () => {
    expect(formatSize(4_700_000_000)).toBe('4.4 GB');
  });

  it('reports megabytes for a small one', () => {
    expect(formatSize(50 * 1024 * 1024)).toBe('50 MB');
  });

  it('says nothing when the server did not', () => {
    expect(formatSize(undefined)).toBeUndefined();
  });
});

describe('descriptions', () => {
  it('finds a provider by id', () => {
    expect(describeLocalProvider('Ollama')?.label).toBe('Ollama');
  });

  it('returns nothing for an id it does not know', () => {
    expect(describeLocalProvider('Nope')).toBeUndefined();
  });
});

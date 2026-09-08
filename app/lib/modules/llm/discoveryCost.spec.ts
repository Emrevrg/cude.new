/**
 * Cude.new — what a provider that cannot answer costs.
 *
 * The model list asks every provider at once, so its speed is the speed of the
 * slowest one. Two things made that eight seconds on every single page load:
 * discovery had no deadline, and only successes were remembered — so the
 * providers that could not answer, which are exactly the slow ones, were asked
 * again every time.
 *
 * GitHub's retired endpoint was the case that showed it: a hostname that no
 * longer resolves takes nearly nine seconds to fail, and nothing cached that.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseProvider, isUsableKey, DISCOVERY_FAILURE_TTL_MS } from './base-provider';
import { discoverOpenAICompatibleModels, DISCOVERY_TIMEOUT_MS } from './providers/openai-compatible-models';
import type { ModelInfo } from './types';

vi.mock('./manager', () => ({ LLMManager: { getInstance: () => ({ env: {} }) } }));

class TestProvider extends BaseProvider {
  name = 'Test';
  staticModels: ModelInfo[] = [];
  config = { apiTokenKey: 'TEST_API_KEY' };

  // Never called here: these tests are about what happens before a model is used.
  getModelInstance(): never {
    throw new Error('not part of this test');
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('asking a provider what it has', () => {
  it('gives up rather than waiting on a host that never answers', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.push(init.signal as AbortSignal);
      return { ok: true, json: async () => ({ data: [] }) } as unknown as Response;
    });

    await discoverOpenAICompatibleModels({ url: 'https://example.com/models', apiKey: 'k', provider: 'Test' });

    expect(seen[0], 'discovery went out with no deadline').toBeInstanceOf(AbortSignal);
    expect(DISCOVERY_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });

  it('says which provider failed, and where', async () => {
    /*
     * "fetch failed", with no provider name, is what made the eight-second
     * stall take so long to attribute.
     */
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'TypeError' });
    });

    await expect(
      discoverOpenAICompatibleModels({ url: 'https://gone.example/models', apiKey: 'k', provider: 'Retired' }),
    ).rejects.toThrow(/Retired.*gone\.example/);
  });

  it('marks a provider that could not be reached as such', async () => {
    /*
     * The log level is decided from this, not from the message. A local model
     * server nobody is running is the ordinary state of a fresh install, and
     * four of those reported as errors on every page load is how a log stops
     * being read. Attaching the reason to the message alone broke it once:
     * the classification was matching on the error's name, and wrapping the
     * error changed the name.
     */
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' });
    });

    await expect(
      discoverOpenAICompatibleModels({ url: 'http://127.0.0.1:1234/v1/models', apiKey: 'k', provider: 'LMStudio' }),
    ).rejects.toMatchObject({ unreachable: true });
  });

  it('names a timeout as a timeout', async () => {
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    });

    await expect(
      discoverOpenAICompatibleModels({ url: 'https://slow.example/models', apiKey: 'k', provider: 'Slow' }),
    ).rejects.toThrow(/did not answer in time/);
  });
});

describe('a provider that just failed', () => {
  const options = { serverEnv: { TEST_API_KEY: 'sk-real-key-value' } };

  it('is not asked again straight away', () => {
    const provider = new TestProvider();

    expect(provider.discoveryFailedRecently(options)).toBe(false);

    provider.storeDiscoveryFailure(options);
    expect(provider.discoveryFailedRecently(options)).toBe(true);
  });

  it('is tried again once the interval is up', () => {
    /*
     * Not the hour a success gets: a local model server someone has just
     * started should appear soon, not be written off for an hour.
     */
    const provider = new TestProvider();
    provider.storeDiscoveryFailure(options);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + DISCOVERY_FAILURE_TTL_MS + 1);
    expect(provider.discoveryFailedRecently(options)).toBe(false);
    expect(DISCOVERY_FAILURE_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('is tried again the moment the credentials change', () => {
    // Pasting a key must retry now, not after the interval.
    const provider = new TestProvider();
    provider.storeDiscoveryFailure(options);

    expect(provider.discoveryFailedRecently({ serverEnv: { TEST_API_KEY: 'sk-a-different-key' } })).toBe(false);
  });
});

describe('telling a real key from a leftover placeholder', () => {
  it('rejects the ones .env.example ships', () => {
    expect(isUsableKey('your_anthropic_api_key_here')).toBe(false);
    expect(isUsableKey('your_openai_api_key_here')).toBe(false);
  });

  it('rejects one wearing a real prefix', () => {
    /*
     * This is the one that got through. It starts with the prefix GitHub's
     * tokens actually use, so the provider looked configured and was asked for
     * its models on every request — against an endpoint that no longer exists.
     */
    expect(isUsableKey('github_pat_your_personal_access_token_here')).toBe(false);
  });

  it('is what decides whether a provider is reported as set up', () => {
    /*
     * The model-list route counted any non-empty string, so a .env copied
     * from the example reported twenty providers as configured — every one
     * of them answering 401, with nothing telling the person that the fix
     * was to paste a real key. Cleared of keys, the honest answer is none.
     */
    const asShippedInTheExample = [
      'your_anthropic_api_key_here',
      'your_openai_api_key_here',
      'github_pat_your_personal_access_token_here',
      '',
      undefined,
    ];

    expect(asShippedInTheExample.filter(isUsableKey)).toEqual([]);
  });

  it('accepts a key that is actually a key', () => {
    // Shaped like the real thing, invented here — never a fragment of anyone's key.
    expect(isUsableKey('sk-or-v1-0000000000000000000000000000000000')).toBe(true);
    expect(isUsableKey('nvapi-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isUsableKey('ghp_16CharactersOfActualToken0123456789')).toBe(true);
  });
});

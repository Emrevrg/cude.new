/**
 * Cude.new — providers someone adds themselves.
 *
 * The validation is the interesting part: a bad entry here does not fail here,
 * it fails later as a network error against an endpoint nobody can find.
 */

import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import {
  CUSTOM_PROVIDERS_COOKIE,
  CUSTOM_PROVIDERS_KEY,
  addCustomProvider,
  defineCustomProvider,
  isCustomProvider,
  readCustomProviders,
  readCustomProvidersFromCookie,
  removeCustomProvider,
  validateCustomProvider,
  writeCustomProviders,
} from './customProviders';

const BUILT_IN = ['Anthropic', 'OpenAI', 'Groq'];

/*
 * These tests run in Node. The persistence path is the point — a provider that
 * is validated but not actually stored would pass a stubbed store.
 */
class StubStorage {
  private _entries = new Map<string, string>();

  getItem(key: string) {
    return this._entries.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this._entries.set(key, value);
  }

  removeItem(key: string) {
    this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
  }
}

beforeAll(() => {
  vi.stubGlobal('localStorage', new StubStorage());
  vi.stubGlobal('window', { localStorage: globalThis.localStorage });
});

beforeEach(() => {
  localStorage.clear();
});

describe('what may be added', () => {
  it('accepts a name and an https endpoint', () => {
    expect(validateCustomProvider({ name: 'Work gateway', baseUrl: 'https://ai.example.com/v1' }, [])).toEqual({
      ok: true,
    });
  });

  it('accepts a plain http endpoint, for a machine on the network', () => {
    expect(validateCustomProvider({ name: 'Lab box', baseUrl: 'http://10.0.0.9:8000/v1' }, []).ok).toBe(true);
  });

  it('refuses an empty or one-letter name', () => {
    expect(validateCustomProvider({ name: '', baseUrl: 'https://x.com' }, []).ok).toBe(false);
    expect(validateCustomProvider({ name: 'a', baseUrl: 'https://x.com' }, []).ok).toBe(false);
  });

  it('refuses a name that is already a built-in provider', () => {
    const result = validateCustomProvider({ name: 'anthropic', baseUrl: 'https://x.com' }, [], BUILT_IN);

    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/built-in/i);
  });

  it('refuses a name already taken by another custom provider', () => {
    const existing = [{ name: 'Gateway', baseUrl: 'https://a.com' }];
    const result = validateCustomProvider({ name: 'gateway', baseUrl: 'https://b.com' }, existing);

    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/already have/i);
  });

  it('refuses a missing or malformed URL', () => {
    expect(validateCustomProvider({ name: 'Thing', baseUrl: '' }, []).ok).toBe(false);
    expect(validateCustomProvider({ name: 'Thing', baseUrl: 'not a url' }, []).ok).toBe(false);
  });

  it('refuses a scheme that is not http', () => {
    for (const url of ['file:///etc/passwd', 'ftp://x.com', 'javascript:alert(1)']) {
      expect(validateCustomProvider({ name: 'Thing', baseUrl: url }, []).ok, url).toBe(false);
    }
  });

  it('says what is wrong, every time it refuses', () => {
    const bad = [
      { name: '', baseUrl: 'https://x.com' },
      { name: 'Thing', baseUrl: '' },
      { name: 'Thing', baseUrl: 'nonsense' },
    ];

    for (const candidate of bad) {
      expect(validateCustomProvider(candidate, []).problem, JSON.stringify(candidate)).toBeTruthy();
    }
  });
});

describe('keeping them', () => {
  it('stores and reads one back', () => {
    expect(addCustomProvider({ name: 'Gateway', baseUrl: 'https://ai.example.com/v1' }).ok).toBe(true);
    expect(readCustomProviders()).toEqual([
      { name: 'Gateway', baseUrl: 'https://ai.example.com/v1', apiKey: undefined, models: undefined },
    ]);
  });

  it('trims the trailing slash, which would double every path', () => {
    addCustomProvider({ name: 'Gateway', baseUrl: 'https://ai.example.com/v1///' });

    expect(readCustomProviders()[0].baseUrl).toBe('https://ai.example.com/v1');
  });

  it('does not store a rejected provider', () => {
    addCustomProvider({ name: 'x', baseUrl: 'nope' });

    expect(readCustomProviders()).toEqual([]);
  });

  it('removes one, and says whether there was one', () => {
    addCustomProvider({ name: 'Gateway', baseUrl: 'https://a.com' });

    expect(removeCustomProvider('Gateway')).toBe(true);
    expect(removeCustomProvider('Gateway')).toBe(false);
    expect(readCustomProviders()).toEqual([]);
  });

  it('recognises its own', () => {
    addCustomProvider({ name: 'Gateway', baseUrl: 'https://a.com' });

    expect(isCustomProvider('Gateway')).toBe(true);
    expect(isCustomProvider('Anthropic')).toBe(false);
  });

  it('survives storage holding something that is not a list', () => {
    localStorage.setItem(CUSTOM_PROVIDERS_KEY, '"just a string"');

    expect(readCustomProviders()).toEqual([]);
  });

  it('drops entries that are missing what a provider needs', () => {
    writeCustomProviders([
      { name: 'Good', baseUrl: 'https://a.com' },
      { baseUrl: 'https://b.com' } as never,
      { name: 'NoUrl' } as never,
    ]);

    expect(readCustomProviders().map((provider) => provider.name)).toEqual(['Good']);
  });
});

describe('using one', () => {
  const provider = { name: 'Work gateway', baseUrl: 'https://ai.example.com/v1', models: ['llama-3-70b'] };

  it('becomes a provider definition like any other', () => {
    const definition = defineCustomProvider(provider);

    expect(definition.name).toBe('Work gateway');
    expect(definition.baseUrl).toBe('https://ai.example.com/v1');
    expect(definition.description).toContain('ai.example.com');
  });

  it('carries the models it was given, attributed to itself', () => {
    const definition = defineCustomProvider(provider);

    expect(definition.staticModels).toHaveLength(1);
    expect(definition.staticModels[0]).toMatchObject({ name: 'llama-3-70b', provider: 'Work gateway' });
  });

  it('asks the endpoint what else it has', () => {
    const definition = defineCustomProvider(provider);
    const url = definition.discovery?.url;

    expect(typeof url === 'function' ? url('https://ai.example.com/v1') : url).toBe('https://ai.example.com/v1/models');
  });

  it('needs no key, because a private gateway usually has none', () => {
    expect(defineCustomProvider(provider).local).toBe(true);
  });

  it('turns its name into a usable environment variable', () => {
    expect(defineCustomProvider(provider).apiTokenKey).toBe('CUSTOM_WORK_GATEWAY_API_KEY');
  });
});

describe('reaching the server', () => {
  const headerFor = (value: unknown) => `${CUSTOM_PROVIDERS_COOKIE}=${encodeURIComponent(JSON.stringify(value))}`;

  it('reads back what the browser sent', () => {
    const header = headerFor([{ name: 'QA gateway', baseUrl: 'http://127.0.0.1:11435/v1' }]);

    expect(readCustomProvidersFromCookie(header)).toEqual([
      { name: 'QA gateway', baseUrl: 'http://127.0.0.1:11435/v1' },
    ]);
  });

  it('finds its cookie among others', () => {
    const header = `session=abc; ${headerFor([{ name: 'Gateway', baseUrl: 'https://a.com' }])}; theme=dark`;

    expect(readCustomProvidersFromCookie(header).map((provider) => provider.name)).toEqual(['Gateway']);
  });

  it('reads nothing when there is no cookie to read', () => {
    expect(readCustomProvidersFromCookie(null)).toEqual([]);
    expect(readCustomProvidersFromCookie('')).toEqual([]);
    expect(readCustomProvidersFromCookie('session=abc; theme=dark')).toEqual([]);
  });

  it('reads nothing from a cookie that is not a list', () => {
    expect(readCustomProvidersFromCookie(headerFor({ name: 'Gateway' }))).toEqual([]);
    expect(readCustomProvidersFromCookie(`${CUSTOM_PROVIDERS_COOKIE}=not-json{{{`)).toEqual([]);
  });

  it('drops entries a provider cannot be built from', () => {
    const header = headerFor([
      { name: 'Good', baseUrl: 'https://a.com' },
      { name: 'NoUrl' },
      { baseUrl: 'https://b.com' },
      { name: '', baseUrl: 'https://c.com' },
    ]);

    expect(readCustomProvidersFromCookie(header).map((provider) => provider.name)).toEqual(['Good']);
  });
});

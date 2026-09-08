import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/*
 * Regression cover for the composer's key badge.
 *
 * `.env.local` copied from `.env.example` carries values like
 * `ANTHROPIC_API_KEY=your_anthropic_api_key_here`. Those are non-empty strings,
 * and the route used a plain truthiness check — so the composer showed a green
 * "Set via environment variable" for a key that cannot authenticate, and the
 * first send then failed with an auth error the UI had just ruled out.
 *
 * The provider layer already discounts placeholders via `isUsableKey`; this
 * route has to agree with it, or the badge is simply wrong.
 */

const getProvider = vi.fn();

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({
      getProvider,
      env: {} as Record<string, string>,
    }),
  },
}));

vi.mock('~/lib/api/cookies', () => ({
  getApiKeysFromCookie: () => ({}),
}));

const { loader } = await import('~/routes/api.check-env-key');

/** Calls the loader the way Remix does, for one provider name. */
async function isSet(provider: string): Promise<boolean> {
  const response = await loader({
    request: new Request(`http://localhost/api/check-env-key?provider=${encodeURIComponent(provider)}`),
    context: {},
    params: {},
  } as never);

  const body = (await (response as Response).json()) as { isSet: boolean };

  return body.isSet;
}

describe('api.check-env-key', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    getProvider.mockReturnValue({ config: { apiTokenKey: 'ANTHROPIC_API_KEY' } });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('reports a real key as set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-Zm9vYmFyYmF6cXV4';
    expect(await isSet('Anthropic')).toBe(true);
  });

  it('does not report the .env.example placeholder as set', async () => {
    process.env.ANTHROPIC_API_KEY = 'your_anthropic_api_key_here';
    expect(await isSet('Anthropic')).toBe(false);
  });

  it.each([
    ['<your-key>', 'angle-bracket placeholder'],
    ['{{ANTHROPIC_API_KEY}}', 'template placeholder'],
    ['changeme', 'changeme'],
    ['placeholder', 'placeholder'],
    ['xxxxxxxx', 'x-filled'],
    ['   ', 'whitespace only'],
    ['', 'empty'],
  ])('does not report %s as set (%s)', async (value) => {
    process.env.ANTHROPIC_API_KEY = value;
    expect(await isSet('Anthropic')).toBe(false);
  });

  it('reports unset when the variable is absent entirely', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await isSet('Anthropic')).toBe(false);
  });

  it('reports unset for an unknown provider rather than guessing', async () => {
    getProvider.mockReturnValue(undefined);
    expect(await isSet('NotAProvider')).toBe(false);
  });

  it('reports unset when the provider declares no token key', async () => {
    getProvider.mockReturnValue({ config: {} });
    expect(await isSet('Ollama')).toBe(false);
  });
});

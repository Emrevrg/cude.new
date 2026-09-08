/**
 * Cude.new - service descriptor behaviour.
 *
 * Each descriptor turns a token into an account. What is worth testing is the
 * shape mapping (every service names its fields differently) and, above all,
 * that no descriptor puts a token in a URL.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SERVICE_DESCRIPTORS, describeService } from './serviceDescriptors';

const TOKEN = 'tok_abcdefghijklmnop';

interface Call {
  url: string;
  init?: RequestInit;
}

let calls: Call[] = [];

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token handling', () => {
  it('never places the token in a URL', async () => {
    for (const descriptor of SERVICE_DESCRIPTORS) {
      respondWith({ id: 1, login: 'x', username: 'x', user: { id: '1' } });
      await descriptor.verify(TOKEN);
    }

    expect(calls).toHaveLength(SERVICE_DESCRIPTORS.length);

    for (const call of calls) {
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it('reports a rejected token in words a user can act on', async () => {
    respondWith({}, 401);

    await expect(describeService('netlify')!.verify(TOKEN)).rejects.toThrow(/rejected this token/i);
  });

  it('reports an unexpected status with its code', async () => {
    respondWith({}, 503);

    await expect(describeService('netlify')!.verify(TOKEN)).rejects.toThrow(/503/);
  });
});

describe('account mapping', () => {
  it('reads a GitHub user', async () => {
    respondWith({ id: 7, login: 'octocat', name: 'The Octocat', avatar_url: 'https://a/b.png' });

    expect(await describeService('github')!.verify(TOKEN)).toMatchObject({
      id: 7,
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://a/b.png',
    });
  });

  it('reads a GitLab user, whose login field is named differently', async () => {
    respondWith({ id: 3, username: 'gitlabber', name: 'A Person' });

    expect(await describeService('gitlab')!.verify(TOKEN)).toMatchObject({ login: 'gitlabber', name: 'A Person' });
  });

  it('reads a Netlify user, whose name field is named differently again', async () => {
    respondWith({ id: 'n1', slug: 'my-team', full_name: 'A Person' });

    expect(await describeService('netlify')!.verify(TOKEN)).toMatchObject({ login: 'my-team', name: 'A Person' });
  });

  it('unwraps the Vercel response envelope', async () => {
    respondWith({ user: { id: 'v1', username: 'someone', email: 'a@b.c' } });

    expect(await describeService('vercel')!.verify(TOKEN)).toMatchObject({ id: 'v1', login: 'someone' });
  });

  it('names a Supabase account even when the API returns no name', async () => {
    respondWith({ user: { id: 's1', email: 'a@b.c' } });

    expect(await describeService('supabase')!.verify(TOKEN)).toMatchObject({
      email: 'a@b.c',
      name: 'Supabase account',
    });
  });
});

describe('self-hosted instances', () => {
  it('asks the instance the user named, not gitlab.com', async () => {
    respondWith({ id: 1, username: 'me' });

    await describeService('gitlab')!.verify(TOKEN, 'https://git.internal/');

    expect(calls[0].url).toBe('https://git.internal/api/v4/user');
  });

  it('defaults to gitlab.com when no instance is given', async () => {
    respondWith({ id: 1, username: 'me' });

    await describeService('gitlab')!.verify(TOKEN);

    expect(calls[0].url).toBe('https://gitlab.com/api/v4/user');
  });
});

describe('the registry', () => {
  it('covers every service the app connects to', () => {
    expect(SERVICE_DESCRIPTORS.map((d) => d.id).sort()).toEqual(['github', 'gitlab', 'netlify', 'supabase', 'vercel']);
  });

  it('sends the Supabase token in the body, not the query string', async () => {
    respondWith({ user: { id: 's1' } });

    await describeService('supabase')!.verify(TOKEN);

    expect(calls[0].init?.method).toBe('POST');
    expect(String(calls[0].init?.body)).toContain(TOKEN);
    expect(calls[0].url).toBe('/api/supabase');
  });
});

/**
 * Cude.new - service connection behaviour.
 *
 * The token-safety tests are the point. A token is the most sensitive value the
 * app holds, and the inherited code had five separate copies of this logic —
 * five places for one to end up somewhere it should not.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { ServiceConnections, type ServiceDescriptor } from './serviceConnections';
import { cudeEventLog } from './eventLog';

const TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz1234';

/*
 * A minimal storage backend. These tests run in Node, and exercising the real
 * persistence path is the point — stubbing the store instead would not prove a
 * token is actually removed on disconnect.
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

function descriptor(overrides: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
  return {
    id: 'github',
    label: 'GitHub',
    verify: vi.fn(async () => ({ login: 'octocat', name: 'The Octocat' })),
    ...overrides,
  };
}

describe('registration', () => {
  let connections: ServiceConnections;

  beforeEach(() => {
    localStorage.clear();
    connections = new ServiceConnections();
  });

  it('starts a registered service disconnected', () => {
    connections.register(descriptor());

    expect(connections.status('github').status).toBe('disconnected');
    expect(connections.isConnected('github')).toBe(false);
  });

  it('restores a connection stored in a previous session', async () => {
    connections.register(descriptor());
    await connections.connect('github', TOKEN);

    const fresh = new ServiceConnections();
    fresh.register(descriptor());

    expect(fresh.isConnected('github')).toBe(true);
    expect(fresh.get('github')?.account?.login).toBe('octocat');
  });

  it('treats a stored token with no account as not yet connected', () => {
    localStorage.setItem('cude.connection.github', JSON.stringify({ token: TOKEN, account: null }));
    connections.register(descriptor());

    expect(connections.status('github').status).toBe('disconnected');
  });
});

describe('connecting', () => {
  let connections: ServiceConnections;

  beforeEach(() => {
    localStorage.clear();
    connections = new ServiceConnections();
    connections.register(descriptor());
  });

  it('verifies the token and records the account', async () => {
    expect(await connections.connect('github', TOKEN)).toBe(true);

    expect(connections.isConnected('github')).toBe(true);
    expect(connections.get('github')?.account?.name).toBe('The Octocat');
    expect(connections.get('github')?.verifiedAt).toBeTruthy();
  });

  it('rejects an empty token without calling the service', async () => {
    const verify = vi.fn();
    connections.register(descriptor({ id: 'netlify', label: 'Netlify', verify }));

    expect(await connections.connect('netlify', '   ')).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(connections.status('netlify').error).toMatch(/token is required/i);
  });

  it('reports a rejected token rather than throwing', async () => {
    connections.register(
      descriptor({
        id: 'vercel',
        label: 'Vercel',
        verify: vi.fn(async () => {
          throw new Error('401 Unauthorized');
        }),
      }),
    );

    expect(await connections.connect('vercel', 'bad')).toBe(false);
    expect(connections.status('vercel')).toMatchObject({ status: 'error', error: '401 Unauthorized' });
  });

  it('refuses a service that was never registered', async () => {
    expect(await connections.connect('supabase', TOKEN)).toBe(false);
    expect(connections.status('supabase').error).toMatch(/unknown service/i);
  });

  it('passes a base URL through for self-hosted services', async () => {
    const verify = vi.fn(async () => ({ login: 'me' }));
    connections.register(descriptor({ id: 'gitlab', label: 'GitLab', verify, selfHostable: true }));

    await connections.connect('gitlab', TOKEN, 'https://git.internal');

    expect(verify).toHaveBeenCalledWith(TOKEN, 'https://git.internal');
    expect(connections.get('gitlab')?.baseUrl).toBe('https://git.internal');
  });
});

describe('token safety', () => {
  let connections: ServiceConnections;

  beforeEach(() => {
    localStorage.clear();
    cudeEventLog.clear();
    connections = new ServiceConnections();
    connections.register(descriptor());
  });

  it('never writes the token into the event journal', async () => {
    await connections.connect('github', TOKEN);

    expect(JSON.stringify(cudeEventLog.events)).not.toContain(TOKEN);
  });

  it('keeps the token out of the journal when the service rejects it', async () => {
    connections.register(
      descriptor({
        verify: vi.fn(async () => {
          throw new Error(`Bad credentials for ${TOKEN}`);
        }),
      }),
    );

    await connections.connect('github', TOKEN);

    // The service put the token in its own error message; the log redacts it.
    expect(JSON.stringify(cudeEventLog.events)).not.toContain(TOKEN);
  });

  it('forgets the stored token on disconnect', async () => {
    await connections.connect('github', TOKEN);
    connections.disconnect('github');

    expect(localStorage.getItem('cude.connection.github')).toBeNull();
    expect(connections.get('github')).toBeUndefined();
    expect(connections.isConnected('github')).toBe(false);
  });
});

describe('environment tokens', () => {
  let connections: ServiceConnections;

  beforeEach(() => {
    localStorage.clear();
    connections = new ServiceConnections();
  });

  it('connects a service whose environment token is set', async () => {
    connections.register(descriptor({ envKey: 'GITHUB_TOKEN' }));

    expect(await connections.connectFromEnvironment({ GITHUB_TOKEN: TOKEN })).toEqual(['github']);
    expect(connections.isConnected('github')).toBe(true);
  });

  it('leaves an already-connected service alone', async () => {
    const verify = vi.fn(async () => ({ login: 'octocat' }));
    connections.register(descriptor({ envKey: 'GITHUB_TOKEN', verify }));
    await connections.connect('github', TOKEN);
    verify.mockClear();

    expect(await connections.connectFromEnvironment({ GITHUB_TOKEN: TOKEN })).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
  });

  it('skips a service with no environment token set', async () => {
    connections.register(descriptor({ envKey: 'GITHUB_TOKEN' }));

    expect(await connections.connectFromEnvironment({})).toEqual([]);
  });

  it('skips a service that declares no environment key', async () => {
    connections.register(descriptor());

    expect(await connections.connectFromEnvironment({ GITHUB_TOKEN: TOKEN })).toEqual([]);
  });
});

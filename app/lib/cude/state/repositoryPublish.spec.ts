/**
 * Cude.new - repository publishing behaviour.
 *
 * The request sequences are stubbed, which is the only honest way to test them
 * without pushing to someone's account. What is being checked is the shape of
 * the conversation with each host: that a new repository is created rather than
 * assumed, that an existing one is committed onto rather than replaced, and
 * that GitLab is told `create` or `update` per file — the distinction its API
 * fails the whole commit over.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { publishRepository, sanitizeRepositoryName, describeFiles } from './repositoryPublish';
import { ServiceConnections } from './serviceConnections';
import { serviceConnections } from './serviceConnections';

const FILES = { 'src/App.tsx': 'export default () => null;\n', 'README.md': '# Hello\n' };

interface Call {
  url: string;
  method: string;
  body?: any;
}

let calls: Call[] = [];
let routes: Array<{ match: RegExp; method?: string; status?: number; body?: unknown }> = [];

function route(match: RegExp, body: unknown, opts: { method?: string; status?: number } = {}) {
  routes.push({ match, body, ...opts });
}

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });

      const hit = routes.find((r) => r.match.test(url) && (!r.method || r.method === method));

      if (!hit) {
        return { ok: false, status: 500, json: async () => ({ message: `unrouted ${method} ${url}` }) } as Response;
      }

      const status = hit.status ?? 200;

      return { ok: status < 400, status, json: async () => hit.body } as Response;
    }),
  );
}

function connectAs(service: 'github' | 'gitlab', login: string) {
  serviceConnections.connections.setKey(service, {
    service,
    token: 'tok_secret_value',
    account: { login },
  });
  serviceConnections.statuses.setKey(service, { status: 'connected' });
}

beforeEach(() => {
  calls = [];
  routes = [];
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  serviceConnections.connections.set({});
  serviceConnections.statuses.set({});
});

describe('names', () => {
  it('replaces characters a host will not accept', () => {
    expect(sanitizeRepositoryName('My Cool App!')).toBe('My-Cool-App');
  });

  it('does not collapse two different names into one', () => {
    expect(sanitizeRepositoryName('a b')).not.toBe(sanitizeRepositoryName('ab'));
  });

  it('trims leading and trailing punctuation', () => {
    expect(sanitizeRepositoryName('  .my-app.  ')).toBe('my-app');
  });

  it('caps the length a host will reject', () => {
    expect(sanitizeRepositoryName('x'.repeat(300))).toHaveLength(100);
  });

  it('refuses a name with nothing usable in it', async () => {
    connectAs('github', 'octocat');

    await expect(publishRepository({ service: 'github', name: '!!!', isPrivate: false, files: FILES })).rejects.toThrow(
      /at least one letter or digit/i,
    );
  });
});

describe('file accounting', () => {
  it('measures each file in bytes, not characters', () => {
    const [file] = describeFiles({ 'a.txt': 'é' });

    expect(file.size).toBe(2);
  });
});

describe('preconditions', () => {
  it('refuses when the service is not connected', async () => {
    await expect(publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES })).rejects.toThrow(
      /connect github first/i,
    );
  });

  it('refuses an empty file set rather than making an empty commit', async () => {
    connectAs('github', 'octocat');

    await expect(publishRepository({ service: 'github', name: 'app', isPrivate: false, files: {} })).rejects.toThrow(
      /no files to publish/i,
    );
  });
});

describe('GitHub', () => {
  beforeEach(() => connectAs('github', 'octocat'));

  function existingRepo(isPrivate = false) {
    route(/repos\/octocat\/app$/, {
      default_branch: 'main',
      html_url: 'https://github.com/octocat/app',
      private: isPrivate,
    });
    route(/git\/ref\/heads\/main$/, { object: { sha: 'refsha' } });
    route(/git\/commits\/refsha$/, { tree: { sha: 'treesha' } });
    route(/git\/trees$/, { sha: 'newtree' }, { method: 'POST' });
    route(/git\/commits$/, { sha: 'newcommit' }, { method: 'POST' });
    route(/git\/refs\/heads\/main$/, {}, { method: 'PATCH' });
  }

  it('commits onto an existing repository', async () => {
    existingRepo();

    const result = await publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES });

    expect(result).toMatchObject({ repoUrl: 'https://github.com/octocat/app', branch: 'main', created: false });
    expect(result.files).toHaveLength(2);
  });

  it('builds on the existing tree so untouched files survive', async () => {
    existingRepo();
    await publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES });

    const tree = calls.find((call) => call.url.endsWith('/git/trees'));

    expect(tree?.body.base_tree).toBe('treesha');
  });

  it('points the new commit at the previous one as its parent', async () => {
    existingRepo();
    await publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES });

    const commit = calls.find((call) => call.url.endsWith('/git/commits') && call.method === 'POST');

    expect(commit?.body.parents).toEqual(['refsha']);
  });

  it('creates the repository when it does not exist', async () => {
    route(/repos\/octocat\/app$/, {}, { status: 404 });
    route(
      /user\/repos$/,
      { default_branch: 'main', html_url: 'https://github.com/octocat/app', private: true },
      { method: 'POST' },
    );
    route(/git\/ref\/heads\/main$/, { object: { sha: 'initial' } });
    route(/git\/commits\/initial$/, { tree: { sha: 'inittree' } });
    route(/git\/trees$/, { sha: 't' }, { method: 'POST' });
    route(/git\/commits$/, { sha: 'c' }, { method: 'POST' });
    route(/git\/refs\/heads\/main$/, {}, { method: 'PATCH' });

    const result = await publishRepository({ service: 'github', name: 'app', isPrivate: true, files: FILES });

    expect(result.created).toBe(true);

    const create = calls.find((call) => call.url.endsWith('/user/repos'));

    // auto_init gives the repository a parent commit to build on.
    expect(create?.body).toMatchObject({ name: 'app', private: true, auto_init: true });
  });

  it('commits with no parent when the repository has no reference yet', async () => {
    route(/repos\/octocat\/app$/, {
      default_branch: 'main',
      html_url: 'https://github.com/octocat/app',
      private: false,
    });
    route(/git\/ref\/heads\/main$/, {}, { status: 404 });
    route(/git\/trees$/, { sha: 't' }, { method: 'POST' });
    route(/git\/commits$/, { sha: 'c' }, { method: 'POST' });
    route(/git\/refs\/heads\/main$/, {}, { method: 'PATCH' });

    await publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES });

    const commit = calls.find((call) => call.url.endsWith('/git/commits') && call.method === 'POST');

    expect(commit?.body.parents).toEqual([]);
  });

  it('changes visibility when it no longer matches what was asked for', async () => {
    existingRepo(false);
    await publishRepository({ service: 'github', name: 'app', isPrivate: true, files: FILES });

    const patch = calls.find((call) => call.method === 'PATCH' && call.url.endsWith('/repos/octocat/app'));

    expect(patch?.body).toEqual({ private: true });
  });

  it('reports the host message rather than a status code', async () => {
    route(/repos\/octocat\/app$/, { default_branch: 'main', html_url: 'u', private: false });
    route(/git\/ref\/heads\/main$/, {}, { status: 404 });
    route(/git\/trees$/, { message: 'tree too large' }, { method: 'POST', status: 422 });

    await expect(publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES })).rejects.toThrow(
      /tree too large/,
    );
  });

  it('never puts the token in a URL', async () => {
    existingRepo();
    await publishRepository({ service: 'github', name: 'app', isPrivate: false, files: FILES });

    for (const call of calls) {
      expect(call.url).not.toContain('tok_secret_value');
    }
  });
});

describe('GitLab', () => {
  beforeEach(() => connectAs('gitlab', 'someone'));

  it('creates a project and commits every file as new', async () => {
    route(/projects\/someone%2Fapp$/, {}, { status: 404 });
    route(
      /api\/v4\/projects$/,
      { id: 5, web_url: 'https://gitlab.com/someone/app', default_branch: 'main', visibility: 'private' },
      { method: 'POST' },
    );
    route(/repository\/commits$/, { id: 'sha' }, { method: 'POST' });

    const result = await publishRepository({ service: 'gitlab', name: 'app', isPrivate: true, files: FILES });

    expect(result).toMatchObject({ repoUrl: 'https://gitlab.com/someone/app', created: true });

    const commit = calls.find((call) => call.url.endsWith('/repository/commits'));

    expect(commit?.body.actions.map((a: any) => a.action)).toEqual(['create', 'create']);
  });

  it('updates the files that are already there and creates the rest', async () => {
    route(/projects\/someone%2Fapp$/, {
      id: 5,
      web_url: 'https://gitlab.com/someone/app',
      default_branch: 'main',
      visibility: 'private',
    });
    route(/repository\/tree/, [{ path: 'README.md', type: 'blob' }]);
    route(/repository\/commits$/, { id: 'sha' }, { method: 'POST' });

    await publishRepository({ service: 'gitlab', name: 'app', isPrivate: true, files: FILES });

    const commit = calls.find((call) => call.url.endsWith('/repository/commits'));
    const byPath = Object.fromEntries(commit!.body.actions.map((a: any) => [a.file_path, a.action]));

    expect(byPath).toEqual({ 'README.md': 'update', 'src/App.tsx': 'create' });
  });

  it('talks to the instance the connection names', async () => {
    serviceConnections.connections.setKey('gitlab', {
      service: 'gitlab',
      token: 'tok_secret_value',
      account: { login: 'someone' },
      baseUrl: 'https://git.internal/',
    });

    route(/git\.internal\/api\/v4\/projects\/someone%2Fapp$/, {}, { status: 404 });
    route(
      /git\.internal\/api\/v4\/projects$/,
      { id: 1, web_url: 'https://git.internal/someone/app', default_branch: 'main', visibility: 'public' },
      { method: 'POST' },
    );
    route(/repository\/commits$/, {}, { method: 'POST' });

    await publishRepository({ service: 'gitlab', name: 'app', isPrivate: false, files: FILES });

    expect(calls.every((call) => !call.url.includes('gitlab.com'))).toBe(true);
  });
});

describe('isolation', () => {
  it('does not share state between connection domains', () => {
    const other = new ServiceConnections();

    expect(other.get('github')).toBeUndefined();
  });
});

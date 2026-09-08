/**
 * Cude.new - publishing a project to a git host.
 *
 * The contract is one sentence: given a name, a visibility and a set of files,
 * put them in a repository as a single commit and say where it went. Both hosts
 * can do that; how they do it differs enough that the two dialogs it replaces
 * had each grown their own copy of the sequence.
 *
 * GitHub is spoken to over its REST API directly rather than through a client
 * library. The commit sequence is six requests either way, and a library that
 * exists to wrap them is a dependency, a bundle cost and a version to track for
 * no behaviour Cude needs.
 */

import { serviceConnections } from './serviceConnections';
import { cudeEventLog } from './eventLog';

export type PublishService = 'github' | 'gitlab';

export interface PublishRequest {
  service: PublishService;
  name: string;
  isPrivate: boolean;
  files: Record<string, string>;
  message?: string;
}

export interface PublishedFile {
  path: string;
  size: number;
}

export interface PublishResult {
  repoUrl: string;
  branch: string;
  files: PublishedFile[];
  created: boolean;
}

/**
 * Both hosts accept letters, digits, dot, dash and underscore in a repository
 * name. Anything else becomes a dash rather than being dropped, so two distinct
 * project names cannot collapse into the same repository.
 */
export function sanitizeRepositoryName(name: string): string {
  return name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
}

export function describeFiles(files: Record<string, string>): PublishedFile[] {
  const encoder = new TextEncoder();

  return Object.entries(files).map(([path, content]) => ({ path, size: encoder.encode(content).length }));
}

class PublishError extends Error {}

function tokenFor(service: PublishService): { token: string; baseUrl?: string } {
  const connection = serviceConnections.get(service);

  if (!connection?.token || !connection.account) {
    throw new PublishError(`Connect ${service === 'github' ? 'GitHub' : 'GitLab'} first.`);
  }

  return { token: connection.token, baseUrl: connection.baseUrl };
}

async function call<T>(url: string, init: RequestInit, host: string): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let detail = `${response.status}`;

    try {
      const body = (await response.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? detail;
    } catch {
      // A non-JSON error body tells us nothing more than the status did.
    }

    throw new PublishError(`${host}: ${detail}`);
  }

  return (await response.json()) as T;
}

/** Returns null on 404 rather than throwing, for "does this exist" questions. */
async function callOrNull<T>(url: string, init: RequestInit, host: string): Promise<T | null> {
  const response = await fetch(url, init);

  if (response.status === 404 || response.status === 409) {
    return null;
  }

  if (!response.ok) {
    throw new PublishError(`${host}: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function publishToGitHub(request: PublishRequest, name: string): Promise<PublishResult> {
  const { token } = tokenFor('github');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  const account = serviceConnections.get('github')!.account!;
  const owner = account.login!;
  const api = `https://api.github.com/repos/${owner}/${name}`;

  let repo = await callOrNull<{ default_branch: string; html_url: string; private: boolean }>(
    api,
    { headers },
    'GitHub',
  );
  const created = repo === null;

  if (!repo) {
    /*
     * auto_init gives the repository an initial commit. Without one there is no
     * branch to build on, and the commit sequence below has no parent to point
     * at — which is the case the inherited dialog handled with a two-second
     * sleep and a fallback.
     */
    repo = await call<{ default_branch: string; html_url: string; private: boolean }>(
      'https://api.github.com/user/repos',
      { method: 'POST', headers, body: JSON.stringify({ name, private: request.isPrivate, auto_init: true }) },
      'GitHub',
    );
  } else if (repo.private !== request.isPrivate) {
    await call(api, { method: 'PATCH', headers, body: JSON.stringify({ private: request.isPrivate }) }, 'GitHub');
  }

  const branch = repo.default_branch || 'main';

  // The reference is absent only in the moment before the initial commit lands.
  const ref = await callOrNull<{ object: { sha: string } }>(`${api}/git/ref/heads/${branch}`, { headers }, 'GitHub');

  let baseTree: string | undefined;

  if (ref) {
    const commit = await call<{ tree: { sha: string } }>(`${api}/git/commits/${ref.object.sha}`, { headers }, 'GitHub');
    baseTree = commit.tree.sha;
  }

  const tree = await call<{ sha: string }>(
    `${api}/git/trees`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTree,
        tree: Object.entries(request.files).map(([path, content]) => ({
          path,
          mode: '100644',
          type: 'blob',
          content,
        })),
      }),
    },
    'GitHub',
  );

  const commit = await call<{ sha: string }>(
    `${api}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: request.message ?? 'Update from Cude',
        tree: tree.sha,
        parents: ref ? [ref.object.sha] : [],
      }),
    },
    'GitHub',
  );

  await call(
    `${api}/git/refs/heads/${branch}`,
    { method: 'PATCH', headers, body: JSON.stringify({ sha: commit.sha, force: true }) },
    'GitHub',
  );

  return { repoUrl: repo.html_url, branch, files: describeFiles(request.files), created };
}

async function publishToGitLab(request: PublishRequest, name: string): Promise<PublishResult> {
  const { token, baseUrl = 'https://gitlab.com' } = tokenFor('gitlab');
  const origin = baseUrl.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const account = serviceConnections.get('gitlab')!.account!;
  const path = `${account.login}/${name}`;

  let project = await callOrNull<{ id: number; web_url: string; default_branch: string | null; visibility: string }>(
    `${origin}/api/v4/projects/${encodeURIComponent(path)}`,
    { headers },
    'GitLab',
  );
  const created = project === null;

  if (!project) {
    project = await call<{ id: number; web_url: string; default_branch: string | null; visibility: string }>(
      `${origin}/api/v4/projects`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          path: name,
          visibility: request.isPrivate ? 'private' : 'public',
          initialize_with_readme: true,
        }),
      },
      'GitLab',
    );
  } else if ((project.visibility === 'private') !== request.isPrivate) {
    await call(
      `${origin}/api/v4/projects/${project.id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ visibility: request.isPrivate ? 'private' : 'public' }),
      },
      'GitLab',
    );
  }

  const branch = project.default_branch ?? 'main';

  /*
   * GitLab has no upsert: a commit action is either `create` or `update`, and
   * the wrong one fails the whole commit. So ask what is already there.
   */
  const existing = created
    ? []
    : ((await callOrNull<Array<{ path: string; type: string }>>(
        `${origin}/api/v4/projects/${project.id}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`,
        { headers },
        'GitLab',
      )) ?? []);

  const present = new Set(existing.filter((entry) => entry.type === 'blob').map((entry) => entry.path));

  const actions = Object.entries(request.files).map(([filePath, content]) => ({
    action: present.has(filePath) ? 'update' : 'create',
    file_path: filePath,
    content,
  }));

  await call(
    `${origin}/api/v4/projects/${project.id}/repository/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branch,
        commit_message: request.message ?? 'Update from Cude',
        actions,
      }),
    },
    'GitLab',
  );

  return { repoUrl: project.web_url, branch, files: describeFiles(request.files), created };
}

/**
 * Publish a project. Throws with a message meant to be shown to the person who
 * asked for it, not a stack trace.
 */
export async function publishRepository(request: PublishRequest): Promise<PublishResult> {
  const name = sanitizeRepositoryName(request.name);

  if (!name) {
    throw new PublishError('A repository name needs at least one letter or digit.');
  }

  if (Object.keys(request.files).length === 0) {
    throw new PublishError('There are no files to publish.');
  }

  const result =
    request.service === 'github' ? await publishToGitHub(request, name) : await publishToGitLab(request, name);

  cudeEventLog.append({
    level: 'success',
    source: 'workspace',
    message: `Published ${result.files.length} files to ${result.repoUrl}`,
  });

  return result;
}

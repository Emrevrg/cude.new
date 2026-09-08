/**
 * Cude.new - how each external service is verified.
 *
 * The connection domain knows nothing about any particular service; it asks a
 * descriptor to turn a token into an account. Everything service-specific lives
 * here, in one readable list, so adding a service is one entry rather than a
 * new store.
 *
 * Note what these do *not* do: no descriptor writes a token to a cookie. The
 * inherited GitLab store did, which put the token on every request to the
 * origin. Tokens stay in the connection domain.
 */

import { serviceConnections, type ServiceAccount, type ServiceDescriptor } from './serviceConnections';

/** Reads a JSON response, turning a failure into a message worth showing. */
async function readJson<T>(response: Response, service: string): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${service} rejected this token.`);
    }

    throw new Error(`${service} responded ${response.status}.`);
  }

  return (await response.json()) as T;
}

const GITHUB: ServiceDescriptor = {
  id: 'github',
  label: 'GitHub',
  envKey: 'GITHUB_TOKEN',
  tokenUrl: 'https://github.com/settings/tokens',
  tokenHint: 'A personal access token with repo scope.',
  async verify(token) {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });

    const user = await readJson<{ id: number; login: string; name?: string; email?: string; avatar_url?: string }>(
      response,
      'GitHub',
    );

    return { id: user.id, login: user.login, name: user.name, email: user.email, avatarUrl: user.avatar_url };
  },
};

const GITLAB: ServiceDescriptor = {
  id: 'gitlab',
  label: 'GitLab',
  envKey: 'GITLAB_TOKEN',
  tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  tokenHint: 'A personal access token with api scope.',
  selfHostable: true,
  async verify(token, baseUrl = 'https://gitlab.com') {
    const origin = baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${origin}/api/v4/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await readJson<{ id: number; username: string; name?: string; email?: string; avatar_url?: string }>(
      response,
      'GitLab',
    );

    return { id: user.id, login: user.username, name: user.name, email: user.email, avatarUrl: user.avatar_url };
  },
};

const NETLIFY: ServiceDescriptor = {
  id: 'netlify',
  label: 'Netlify',
  envKey: 'NETLIFY_AUTH_TOKEN',
  tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
  tokenHint: 'A personal access token.',
  async verify(token) {
    const response = await fetch('https://api.netlify.com/api/v1/user', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await readJson<{ id: string; slug?: string; full_name?: string; email?: string; avatar_url?: string }>(
      response,
      'Netlify',
    );

    return { id: user.id, login: user.slug, name: user.full_name, email: user.email, avatarUrl: user.avatar_url };
  },
};

const VERCEL: ServiceDescriptor = {
  id: 'vercel',
  label: 'Vercel',
  envKey: 'VERCEL_TOKEN',
  tokenUrl: 'https://vercel.com/account/tokens',
  tokenHint: 'An account token with access to your projects.',
  async verify(token) {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const { user } = await readJson<{
      user: { id: string; username?: string; name?: string; email?: string; avatar?: string };
    }>(response, 'Vercel');

    return { id: user.id, login: user.username, name: user.name, email: user.email };
  },
};

/*
 * Supabase is verified through this app's own route rather than directly: the
 * management API does not allow a browser origin, so the request has to be made
 * server-side. The token is sent in the body, never in the URL.
 */
const SUPABASE: ServiceDescriptor = {
  id: 'supabase',
  label: 'Supabase',
  envKey: 'SUPABASE_ACCESS_TOKEN',
  tokenUrl: 'https://supabase.com/dashboard/account/tokens',
  tokenHint: 'A personal access token from your account settings.',
  async verify(token) {
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await readJson<{ user?: { id?: string; email?: string; name?: string } }>(response, 'Supabase');

    return { id: data.user?.id, email: data.user?.email, name: data.user?.name ?? 'Supabase account' };
  },
};

export const SERVICE_DESCRIPTORS: ServiceDescriptor[] = [GITHUB, GITLAB, NETLIFY, VERCEL, SUPABASE];

export function describeService(id: string): ServiceDescriptor | undefined {
  return SERVICE_DESCRIPTORS.find((descriptor) => descriptor.id === id);
}

/** Registers every service, restoring any connection stored in this browser. */
export function registerServices(): void {
  for (const descriptor of SERVICE_DESCRIPTORS) {
    serviceConnections.register(descriptor);
  }
}

export type { ServiceAccount };

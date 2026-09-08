/**
 * Cude.new - what a connected service holds.
 *
 * A connection proves who you are; this says what you have there. Netlify calls
 * them sites, Vercel calls them projects, GitHub and GitLab call them
 * repositories — the surfaces render the same list either way, so they are
 * normalised to one shape here rather than five times in five tabs.
 *
 * Fetching is explicit. The inherited stores refreshed on construction, which
 * meant opening the app made network calls to every connected service whether
 * or not anything was going to read the result.
 */

import { map } from 'nanostores';
import { serviceConnections, type ServiceId } from './serviceConnections';
import { describeService } from './serviceDescriptors';
import { cudeEventLog } from './eventLog';

export interface ServiceResource {
  id: string;
  name: string;

  /** Where a person would go to look at it. */
  url?: string;

  /** ISO timestamp of the last change, when the service reports one. */
  updatedAt?: string;

  /** One short line of service-specific context, already formatted. */
  detail?: string;
}

export interface ResourceSet {
  items: ServiceResource[];
  fetchedAt: string;
  loading: boolean;
  error?: string;
}

const EMPTY: ResourceSet = { items: [], fetchedAt: '', loading: false };

/** What each service calls the things it holds. */
export const RESOURCE_LABEL: Record<ServiceId, string> = {
  github: 'Repositories',
  gitlab: 'Projects',
  netlify: 'Sites',
  vercel: 'Projects',
  supabase: 'Projects',
};

async function json<T>(url: string, init: RequestInit, service: string): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${service} responded ${response.status}.`);
  }

  return (await response.json()) as T;
}

type Loader = (token: string, baseUrl?: string) => Promise<ServiceResource[]>;

const LOADERS: Record<ServiceId, Loader> = {
  async github(token) {
    const repos = await json<
      Array<{ id: number; full_name: string; html_url: string; updated_at: string; private: boolean }>
    >(
      'https://api.github.com/user/repos?per_page=100&sort=updated',
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
      'GitHub',
    );

    return repos.map((repo) => ({
      id: String(repo.id),
      name: repo.full_name,
      url: repo.html_url,
      updatedAt: repo.updated_at,
      detail: repo.private ? 'Private' : 'Public',
    }));
  },

  async gitlab(token, baseUrl = 'https://gitlab.com') {
    const origin = baseUrl.replace(/\/+$/, '');
    const projects = await json<
      Array<{ id: number; path_with_namespace: string; web_url: string; last_activity_at: string; visibility: string }>
    >(
      `${origin}/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at`,
      { headers: { Authorization: `Bearer ${token}` } },
      'GitLab',
    );

    return projects.map((project) => ({
      id: String(project.id),
      name: project.path_with_namespace,
      url: project.web_url,
      updatedAt: project.last_activity_at,
      detail: project.visibility,
    }));
  },

  async netlify(token) {
    const sites = await json<Array<{ id: string; name: string; ssl_url?: string; url?: string; updated_at: string }>>(
      'https://api.netlify.com/api/v1/sites',
      { headers: { Authorization: `Bearer ${token}` } },
      'Netlify',
    );

    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      url: site.ssl_url ?? site.url,
      updatedAt: site.updated_at,
    }));
  },

  async vercel(token) {
    const { projects } = await json<{
      projects: Array<{
        id: string;
        name: string;
        updatedAt?: number;
        targets?: { production?: { url?: string; alias?: string[] } };
      }>;
    }>('https://api.vercel.com/v9/projects', { headers: { Authorization: `Bearer ${token}` } }, 'Vercel');

    return projects.map((project) => {
      const production = project.targets?.production;

      /*
       * Vercel gives a deployment host and, usually, friendlier aliases. Prefer
       * the plain project alias: it is the address a person would share, and it
       * survives the next deploy.
       */
      const alias = production?.alias?.find((a) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app'));
      const host = alias ?? production?.url;

      return {
        id: project.id,
        name: project.name,
        url: host ? `https://${host}` : undefined,
        updatedAt: project.updatedAt ? new Date(project.updatedAt).toISOString() : undefined,
      };
    });
  },

  async supabase(token) {
    const data = await json<{
      stats?: { projects?: Array<{ id: string; name: string; region?: string; created_at?: string }> };
    }>(
      '/api/supabase',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) },
      'Supabase',
    );

    return (data.stats?.projects ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.created_at,
      detail: project.region,
    }));
  },
};

export class ServiceResources {
  readonly sets = map<Partial<Record<ServiceId, ResourceSet>>>({});

  get(service: ServiceId): ResourceSet {
    return this.sets.get()[service] ?? EMPTY;
  }

  /**
   * Load what the service holds. Returns the items so a caller that needs them
   * immediately does not have to subscribe.
   */
  async load(service: ServiceId): Promise<ServiceResource[]> {
    const connection = serviceConnections.get(service);

    if (!connection) {
      this.sets.setKey(service, { ...EMPTY, error: 'Not connected.' });
      return [];
    }

    this.sets.setKey(service, { ...this.get(service), loading: true, error: undefined });

    try {
      const items = await LOADERS[service](connection.token, connection.baseUrl);
      this.sets.setKey(service, { items, fetchedAt: new Date().toISOString(), loading: false });

      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sets.setKey(service, { ...this.get(service), loading: false, error: message });

      cudeEventLog.error('settings', `Could not list ${describeService(service)?.label ?? service} resources`, error);

      return [];
    }
  }

  /** Load only if nothing has been loaded yet. */
  async loadOnce(service: ServiceId): Promise<ServiceResource[]> {
    const existing = this.get(service);

    if (existing.fetchedAt) {
      return existing.items;
    }

    return this.load(service);
  }

  forget(service: ServiceId): void {
    this.sets.setKey(service, undefined);
  }

  reset(): void {
    this.sets.set({});
  }
}

export const serviceResources = new ServiceResources();

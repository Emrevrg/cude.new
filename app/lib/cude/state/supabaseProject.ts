/**
 * Cude.new - the Supabase project a conversation builds against.
 *
 * Connecting Supabase says who you are; this says which of your projects the
 * generated app should talk to, and holds the two values it needs to do so —
 * the project URL and its anonymous key.
 *
 * The anonymous key is public by design: it ships in the client bundle of any
 * Supabase app and is meant to be seen. The access token that fetches it is
 * not, and never leaves the connection domain.
 */

import { atom, map } from 'nanostores';
import { readStored, writeStored, removeStored } from './browserStore';
import { serviceConnections } from './serviceConnections';
import { serviceResources, type ServiceResource } from './serviceResources';
import { cudeEventLog } from './eventLog';

const SELECTED_KEY = 'cude.supabase.project';

export interface SupabaseCredentials {
  supabaseUrl: string;
  anonKey: string;
}

export interface SupabaseProjectState {
  projectId?: string;
  credentials?: SupabaseCredentials;
  loading: boolean;
  error?: string;
}

interface StoredSelection {
  projectId: string;
  credentials?: SupabaseCredentials;
}

export class SupabaseProject {
  readonly state = map<SupabaseProjectState>({ loading: false });

  /** True while a project is selected and usable. */
  readonly ready = atom(false);

  constructor() {
    const stored = readStored<StoredSelection>(SELECTED_KEY);

    if (stored?.projectId) {
      this.state.set({ projectId: stored.projectId, credentials: stored.credentials, loading: false });
      this.ready.set(Boolean(stored.credentials));
    }
  }

  get projectId(): string | undefined {
    return this.state.get().projectId;
  }

  get credentials(): SupabaseCredentials | undefined {
    return this.state.get().credentials;
  }

  /** Lists the projects on the connected account. */
  async list(): Promise<ServiceResource[]> {
    return serviceResources.loadOnce('supabase');
  }

  /**
   * Choose a project and fetch the credentials the generated app will use.
   *
   * Returns the credentials, or null when they could not be read — a caller
   * should not proceed to write them into a project on a null.
   */
  async select(projectId: string): Promise<SupabaseCredentials | null> {
    const connection = serviceConnections.get('supabase');

    if (!connection) {
      this.state.set({ loading: false, error: 'Connect Supabase first.' });
      return null;
    }

    this.state.set({ projectId, loading: true });

    try {
      const response = await fetch('/api/supabase/variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, token: connection.token }),
      });

      if (!response.ok) {
        throw new Error(`Supabase responded ${response.status}.`);
      }

      const { apiKeys } = (await response.json()) as { apiKeys: Array<{ name: string; api_key: string }> };

      /*
       * Supabase has called this key both `anon` and `public` over time. Accept
       * either rather than failing on a rename.
       */
      const anon = apiKeys.find((key) => key.name === 'anon' || key.name === 'public');

      if (!anon) {
        throw new Error('That project has no anonymous key.');
      }

      const credentials: SupabaseCredentials = {
        supabaseUrl: `https://${projectId}.supabase.co`,
        anonKey: anon.api_key,
      };

      this.state.set({ projectId, credentials, loading: false });
      this.ready.set(true);
      writeStored(SELECTED_KEY, { projectId, credentials } satisfies StoredSelection);

      cudeEventLog.append({ level: 'success', source: 'settings', message: 'Selected a Supabase project' });

      return credentials;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.set({ projectId, loading: false, error: message });
      this.ready.set(false);

      cudeEventLog.error('settings', 'Could not read the Supabase project keys', error);

      return null;
    }
  }

  /**
   * Run SQL against the selected project.
   *
   * Lives here rather than in the alert component so that nothing rendering a
   * dialog has to hold the access token to do its job.
   */
  async runQuery(sql: string): Promise<void> {
    const connection = serviceConnections.get('supabase');
    const projectId = this.projectId;

    if (!connection || !projectId) {
      throw new Error('Connect Supabase and choose a project first.');
    }

    const response = await fetch('/api/supabase/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` },
      body: JSON.stringify({ projectId, query: sql }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };

      throw new Error(body.error?.message ?? `Supabase responded ${response.status}.`);
    }
  }

  /** Forget the selection, leaving the account connected. */
  clear(): void {
    this.state.set({ loading: false });
    this.ready.set(false);
    removeStored(SELECTED_KEY);
  }
}

export const supabaseProject = new SupabaseProject();

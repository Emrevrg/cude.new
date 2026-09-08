/**
 * Cude.new - connections to external services.
 *
 * GitHub, GitLab, Netlify, Vercel and Supabase all need the same thing: a
 * token, a check that it works, the account it belongs to, and somewhere to
 * keep that between sessions. The inherited code had five near-identical
 * stores, each with its own persistence, its own auto-connect, and its own
 * idea of what to log.
 *
 * One implementation, parameterised by service. That matters beyond tidiness:
 * a token is the most sensitive value this app holds, and five separate copies
 * of the handling code is five places for one of them to leak.
 */

import { atom, map } from 'nanostores';
import { readStored, writeStored, removeStored } from './browserStore';
import { cudeEventLog } from './eventLog';

export type ServiceId = 'github' | 'gitlab' | 'netlify' | 'vercel' | 'supabase';

/** The account a token belongs to, in the shape the surfaces render. */
export interface ServiceAccount {
  id?: string | number;
  login?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ServiceConnection {
  service: ServiceId;

  /** Present only in memory and in this browser. Never logged. */
  token: string;
  account: ServiceAccount | null;

  /** Where a self-hosted instance lives, for services that allow one. */
  baseUrl?: string;

  /** ISO timestamp of the last successful verification. */
  verifiedAt?: string;
}

export interface ServiceDescriptor {
  id: ServiceId;
  label: string;

  /** Verifies a token and returns the account it belongs to. */
  verify(token: string, baseUrl?: string): Promise<ServiceAccount>;

  /** Environment variable that can seed a token in development. */
  envKey?: string;

  /** True when the service is self-hosted and takes a base URL. */
  selfHostable?: boolean;

  /** Where a person creates a token for this service. */
  tokenUrl?: string;

  /** What the token needs to be able to do. */
  tokenHint?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
}

function storageKey(service: ServiceId): string {
  return `cude.connection.${service}`;
}

/** Shape kept in browser storage. */
interface StoredConnection {
  token: string;
  account: ServiceAccount | null;
  baseUrl?: string;
  verifiedAt?: string;
}

export class ServiceConnections {
  /** Connection per service. */
  readonly connections = map<Partial<Record<ServiceId, ServiceConnection>>>({});

  /** Live status per service, for the surfaces. */
  readonly statuses = map<Partial<Record<ServiceId, ConnectionState>>>({});

  private _descriptors = new Map<ServiceId, ServiceDescriptor>();

  /** Register a service and restore anything previously stored for it. */
  register(descriptor: ServiceDescriptor): void {
    this._descriptors.set(descriptor.id, descriptor);

    const stored = readStored<StoredConnection>(storageKey(descriptor.id));

    if (stored?.token) {
      this.connections.setKey(descriptor.id, {
        service: descriptor.id,
        token: stored.token,
        account: stored.account ?? null,
        baseUrl: stored.baseUrl,
        verifiedAt: stored.verifiedAt,
      });
      this.statuses.setKey(descriptor.id, { status: stored.account ? 'connected' : 'disconnected' });

      return;
    }

    this.statuses.setKey(descriptor.id, { status: 'disconnected' });
  }

  get(service: ServiceId): ServiceConnection | undefined {
    return this.connections.get()[service];
  }

  status(service: ServiceId): ConnectionState {
    return this.statuses.get()[service] ?? { status: 'disconnected' };
  }

  isConnected(service: ServiceId): boolean {
    return this.status(service).status === 'connected';
  }

  /**
   * Verify a token and remember it.
   *
   * The token never reaches the event log: only the service name and the
   * outcome are recorded.
   */
  async connect(service: ServiceId, token: string, baseUrl?: string): Promise<boolean> {
    const descriptor = this._descriptors.get(service);

    if (!descriptor) {
      this.statuses.setKey(service, { status: 'error', error: `Unknown service: ${service}` });
      return false;
    }

    if (!token.trim()) {
      this.statuses.setKey(service, { status: 'error', error: 'A token is required.' });
      return false;
    }

    this.statuses.setKey(service, { status: 'connecting' });

    try {
      const account = await descriptor.verify(token, baseUrl);
      const connection: ServiceConnection = {
        service,
        token,
        account,
        baseUrl,
        verifiedAt: new Date().toISOString(),
      };

      this.connections.setKey(service, connection);
      this.statuses.setKey(service, { status: 'connected' });
      this._persist(service, connection);

      cudeEventLog.append({
        level: 'success',
        source: 'settings',
        message: `Connected to ${descriptor.label}`,
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statuses.setKey(service, { status: 'error', error: message });

      // The message comes from the service; redaction happens in the log.
      cudeEventLog.error('settings', `Could not connect to ${descriptor.label}`, error);

      return false;
    }
  }

  /** Forget a connection, including its stored token. */
  disconnect(service: ServiceId): void {
    const descriptor = this._descriptors.get(service);

    this.connections.setKey(service, undefined);
    this.statuses.setKey(service, { status: 'disconnected' });
    removeStored(storageKey(service));

    if (descriptor) {
      cudeEventLog.append({
        level: 'info',
        source: 'settings',
        message: `Disconnected from ${descriptor.label}`,
      });
    }
  }

  /**
   * Connect using a token from the environment, if one is set and the service
   * is not already connected.
   *
   * Returns the services it connected, so a caller can report what happened.
   */
  async connectFromEnvironment(env: Record<string, string | undefined>): Promise<ServiceId[]> {
    const connected: ServiceId[] = [];

    for (const descriptor of this._descriptors.values()) {
      if (!descriptor.envKey || this.isConnected(descriptor.id)) {
        continue;
      }

      const token = env[descriptor.envKey];

      if (!token) {
        continue;
      }

      if (await this.connect(descriptor.id, token)) {
        connected.push(descriptor.id);
      }
    }

    return connected;
  }

  private _persist(service: ServiceId, connection: ServiceConnection): void {
    const stored: StoredConnection = {
      token: connection.token,
      account: connection.account,
      baseUrl: connection.baseUrl,
      verifiedAt: connection.verifiedAt,
    };

    writeStored(storageKey(service), stored);
  }

  /** Test seam: forget every registration and connection. */
  reset(): void {
    for (const service of this._descriptors.keys()) {
      removeStored(storageKey(service));
    }

    this._descriptors.clear();
    this.connections.set({});
    this.statuses.set({});
  }
}

/** The application's service connections. */
export const serviceConnections = new ServiceConnections();

/** True once at least one service is connected. */
export const anyServiceConnected = atom<boolean>(false);

serviceConnections.statuses.listen((statuses) => {
  anyServiceConnected.set(Object.values(statuses).some((state) => state?.status === 'connected'));
});

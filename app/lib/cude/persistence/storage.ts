/**
 * Cude.new - storage backends.
 *
 * Two implementations of `ProjectStorage`: IndexedDB in the browser, and an
 * in-memory map for tests, the verifiers and SSR. Both are constructed, never
 * imported as a live handle, so nothing is opened as a side effect of loading a
 * module.
 */

import type { ProjectStorage } from './types';

export const DATABASE_NAME = 'cude';
export const DATABASE_VERSION = 1;
export const STORE_NAME = 'projects';

/** In-memory storage. Used by tests, the verifiers, and on the server. */
export class MemoryProjectStorage implements ProjectStorage {
  readonly kind = 'memory';

  private _entries = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    for (const [key, value] of Object.entries(initial ?? {})) {
      this._entries.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this._entries.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this._entries.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this._entries.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this._entries.keys()].sort();
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** IndexedDB-backed storage for the browser. */
export class IndexedDbProjectStorage implements ProjectStorage {
  readonly kind = 'indexeddb';

  private _db: Promise<IDBDatabase> | null = null;

  private _open(): Promise<IDBDatabase> {
    if (this._db) {
      return this._db;
    }

    this._db = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the project database'));
    });

    return this._db;
  }

  private async _tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this._open();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  async get(key: string): Promise<string | null> {
    const store = await this._tx('readonly');
    const value = await promisify<unknown>(store.get(key));

    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this._tx('readwrite');
    await promisify(store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    const store = await this._tx('readwrite');
    await promisify(store.delete(key));
  }

  async keys(): Promise<string[]> {
    const store = await this._tx('readonly');
    const keys = await promisify<IDBValidKey[]>(store.getAllKeys());

    return keys.filter((k): k is string => typeof k === 'string').sort();
  }
}

/**
 * Pick a backend for the current environment.
 *
 * Falls back to memory wherever IndexedDB is unavailable — a private window, a
 * server render — so a caller always gets a working store rather than an
 * exception at import time.
 */
export function createProjectStorage(): ProjectStorage {
  if (typeof indexedDB === 'undefined') {
    return new MemoryProjectStorage();
  }

  return new IndexedDbProjectStorage();
}

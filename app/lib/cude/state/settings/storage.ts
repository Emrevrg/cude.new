/**
 * Cude.new - settings persistence.
 *
 * One place that reads, validates and writes settings, instead of a dozen
 * inline `localStorage.getItem` calls each with their own parsing and their own
 * idea of what to do when the value is wrong.
 *
 * Every read is total: a missing, corrupt, or wrong-typed value yields the
 * default rather than throwing or producing `undefined` halfway through
 * startup.
 */

import type { SettingsStorage } from './types';

export const SETTINGS_PREFIX = 'cude.settings.';

/** Browser-backed settings storage. */
export class LocalSettingsStorage implements SettingsStorage {
  readonly kind = 'localStorage';

  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      // Private mode, or storage disabled entirely.
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota or private mode. Settings are a convenience, not a requirement.
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // As above.
    }
  }
}

/** In-memory settings storage, for tests, the verifiers, and the server. */
export class MemorySettingsStorage implements SettingsStorage {
  readonly kind = 'memory';

  private _entries = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    for (const [key, value] of Object.entries(initial ?? {})) {
      this._entries.set(key, value);
    }
  }

  get(key: string): string | null {
    return this._entries.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this._entries.set(key, value);
  }

  remove(key: string): void {
    this._entries.delete(key);
  }
}

/** Pick a backend. Falls back to memory wherever there is no DOM. */
export function createSettingsStorage(): SettingsStorage {
  if (typeof localStorage === 'undefined') {
    return new MemorySettingsStorage();
  }

  return new LocalSettingsStorage();
}

/**
 * Read a JSON value, falling back to the default on anything unexpected.
 *
 * `validate` runs on the parsed value so a structurally valid but semantically
 * wrong record (an array where an object belongs, a boolean where a string
 * belongs) is treated the same as corruption.
 */
export function readJson<T>(
  storage: SettingsStorage,
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  const raw = storage.get(SETTINGS_PREFIX + key);

  if (raw === null) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (validate && !validate(parsed)) {
      return fallback;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJson(storage: SettingsStorage, key: string, value: unknown): void {
  try {
    storage.set(SETTINGS_PREFIX + key, JSON.stringify(value));
  } catch {
    /*
     * A value that cannot be serialized is a programming error, not a user
     * problem; dropping the write is better than breaking the settings panel.
     */
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

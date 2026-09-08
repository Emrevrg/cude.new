/**
 * Cude.new - product preferences.
 *
 * One record, read once, written whole. The inherited implementation kept six
 * separate `localStorage` keys and six separate parsers, which meant a
 * preference could be half-applied: `eventLogs` could read as a string `"false"`
 * and be treated as truthy while `latestBranch` next to it parsed correctly.
 */

import { atom } from 'nanostores';
import { DEFAULT_PREFERENCES, type CudePreferences, type SettingsStorage } from './types';
import { createSettingsStorage, isPlainObject, readJson, writeJson } from './storage';

export const PREFERENCES_KEY = 'preferences';

/** Coerce an unknown record into a complete, well-typed preferences object. */
export function normalizePreferences(value: unknown): CudePreferences {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_PREFERENCES };
  }

  const bool = (key: keyof CudePreferences, fallback: boolean): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback;

  const promptId = typeof value.promptId === 'string' && value.promptId ? value.promptId : DEFAULT_PREFERENCES.promptId;

  return {
    latestBranch: bool('latestBranch', DEFAULT_PREFERENCES.latestBranch),
    autoSelectTemplate: bool('autoSelectTemplate', DEFAULT_PREFERENCES.autoSelectTemplate),
    contextOptimization: bool('contextOptimization', DEFAULT_PREFERENCES.contextOptimization),
    eventLogs: bool('eventLogs', DEFAULT_PREFERENCES.eventLogs),
    promptId,
    developerMode: bool('developerMode', DEFAULT_PREFERENCES.developerMode),
  };
}

export class PreferencesDomain {
  readonly store = atom<CudePreferences>({ ...DEFAULT_PREFERENCES });

  constructor(private readonly _storage: SettingsStorage) {
    this.store.set(normalizePreferences(readJson<unknown>(this._storage, PREFERENCES_KEY, null)));
  }

  get(): CudePreferences {
    return this.store.get();
  }

  /** Update one or more preferences and persist the whole record. */
  update(patch: Partial<CudePreferences>): CudePreferences {
    const next = normalizePreferences({ ...this.store.get(), ...patch });
    this.store.set(next);
    writeJson(this._storage, PREFERENCES_KEY, next);

    return next;
  }

  /** Restore defaults. */
  reset(): CudePreferences {
    const next = { ...DEFAULT_PREFERENCES };
    this.store.set(next);
    writeJson(this._storage, PREFERENCES_KEY, next);

    return next;
  }
}

/** The application's preferences. */
export const preferences = new PreferencesDomain(createSettingsStorage());

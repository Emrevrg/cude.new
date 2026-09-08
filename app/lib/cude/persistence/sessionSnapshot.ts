/**
 * Cude.new - pipeline session snapshot.
 *
 * The Cude stores held the entire pipeline — architecture, design contract,
 * approval state, agent progress — in memory only, so a reload discarded a
 * product that had already been through requirements, architecture and design
 * review. The user had to start over.
 *
 * This captures that state as a plain, serializable snapshot and restores it.
 * It is deliberately separate from the nanostores themselves: the stores stay a
 * pure in-memory view, and persistence is something the app does to them rather
 * than a behaviour baked into every atom.
 */

import type { ProjectStorage } from './types';

export const SESSION_KEY = 'session:current';
export const SESSION_SCHEMA_VERSION = 1;

/**
 * Serializable image of the pipeline.
 *
 * Typed loosely on purpose: this module's job is durability, not re-validating
 * domain objects the architecture layer already owns. Each field is restored
 * only if it round-trips as JSON.
 */
export interface SessionSnapshot {
  schemaVersion: number;
  projectId?: string;
  platform?: string;
  status?: string;
  architecture?: unknown;
  designSystem?: unknown;
  designContract?: unknown;
  designRevisionSummary?: string[];
  selectedTarget?: string | null;
  savedAt: string;
}

export interface SessionSnapshotInput extends Omit<SessionSnapshot, 'schemaVersion' | 'savedAt'> {}

/** Persist the current pipeline state. */
export async function saveSession(storage: ProjectStorage, input: SessionSnapshotInput): Promise<SessionSnapshot> {
  const snapshot: SessionSnapshot = {
    ...input,
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };

  await storage.set(SESSION_KEY, JSON.stringify(snapshot));

  return snapshot;
}

/**
 * Restore the pipeline state, or null when there is nothing usable.
 *
 * A corrupt or future-version snapshot resolves to null rather than throwing:
 * failing to restore a session must degrade to a fresh session, never to a
 * broken application.
 */
export async function loadSession(storage: ProjectStorage): Promise<SessionSnapshot | null> {
  const raw = await storage.get(SESSION_KEY);

  if (!raw) {
    return null;
  }

  let parsed: SessionSnapshot;

  try {
    parsed = JSON.parse(raw) as SessionSnapshot;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return null;
  }

  return parsed;
}

/** Forget the current session. */
export async function clearSession(storage: ProjectStorage): Promise<void> {
  await storage.delete(SESSION_KEY);
}

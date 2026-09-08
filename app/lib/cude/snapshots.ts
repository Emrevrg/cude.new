/**
 * Cude.new — file snapshots the user can jump back to.
 *
 * Not the pipeline's own beginBuild bookkeeping: these are explicit moments
 * the person saved, listed by name and restorable with one click. The files
 * are the workspace FileMap serialized; the workbench owns applying them.
 */

export interface FileSnapshot {
  id: string;
  label: string;
  createdAt: number;
  files: Record<string, unknown>;
}

function storage(): Storage {
  return (typeof window !== 'undefined' ? window.localStorage : undefined) as unknown as Storage;
}

const SNAPSHOT_STORAGE_KEY = 'cude.fileSnapshots';
const MAX_SNAPSHOTS = 20;

/** Read every saved snapshot. Newest first. */
export function readSnapshots(): FileSnapshot[] {
  try {
    const ls = storage();

    if (!ls) {
      return [];
    }

    const raw = ls.getItem(SNAPSHOT_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as FileSnapshot[];

    return Array.isArray(parsed) ? [...parsed].sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

/** Save the current workspace FileMap as a snapshot. Keeps the newest 20. */
export function saveSnapshot(label: string, files: Record<string, unknown>): FileSnapshot {
  const entry: FileSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim() || new Date().toLocaleString(),
    createdAt: Date.now(),
    files: JSON.parse(JSON.stringify(files)) as Record<string, unknown>,
  };

  const next = [entry, ...readSnapshots()].slice(0, MAX_SNAPSHOTS);

  const ls = storage();

  if (ls) {
    ls.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  }

  return entry;
}

/** Drop one snapshot. */
export function deleteSnapshot(id: string): void {
  const next = readSnapshots().filter((entry) => entry.id !== id);
  const ls2 = storage();

  if (!ls2) {
    return;
  }

  if (next.length === 0) {
    ls2.removeItem(SNAPSHOT_STORAGE_KEY);
  } else {
    ls2.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  }
}

/** For tests. */
export function clearSnapshots(): void {
  storage()?.removeItem(SNAPSHOT_STORAGE_KEY);
}

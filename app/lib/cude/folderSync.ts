/**
 * Cude.new - the folder on disk the project is tied to, if any.
 *
 * Opening a folder and saving to a folder are two ends of one relationship:
 * once a folder is picked — either way — the next save goes straight there
 * instead of asking again. Kept outside React state because both the landing
 * buttons and the workbench toolbar reach for it, and neither owns it.
 */

let handle: FileSystemDirectoryHandle | null = null;

/** The remembered folder, if the person picked one. */
export function getSyncedFolder(): FileSystemDirectoryHandle | null {
  return handle;
}

/** Remember a picked folder for the next save. */
export function setSyncedFolder(next: FileSystemDirectoryHandle | null): void {
  handle = next;
}

/** True when saves can go straight to disk without asking. */
export function hasSyncedFolder(): boolean {
  return handle !== null;
}

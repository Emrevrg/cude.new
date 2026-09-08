/**
 * Cude.new - workspace file synchronisation.
 *
 * Keeps the pure `WorkspaceFiles` model and the runtime workspace agreeing.
 * Two directions:
 *
 *   local  → runtime   a save from the editor or the Builder
 *   runtime → local    anything that changed in the workspace itself
 *
 * The echo problem is the reason this layer exists. Writing a file causes the
 * runtime to report a change for that same file; naively applying it would
 * overwrite whatever the user typed in the meantime. Writes are therefore
 * tracked until their echo arrives, and an echo carrying exactly what we wrote
 * is dropped.
 *
 * Everything is disposable. The inherited implementation registered a watcher
 * and a 30-second interval that were never cleared, so both kept running after
 * the workspace they watched was gone.
 */

import type { CudeRuntime, FileChange, WorkspaceFile } from '~/lib/cude/runtime/types';
import { WorkspaceFiles, normalizePath, type WorkspaceFileMap } from './fileModel';

/** How a runtime change that collides with a local edit is resolved. */
export type ConflictPolicy = 'keep-local' | 'take-runtime';

export interface FileSyncOptions {
  /**
   * What to do when the runtime reports a change to a file the user has edited
   * locally. Defaults to keeping the local edit: silently discarding unsaved
   * work is the worse failure.
   */
  conflictPolicy?: ConflictPolicy;

  /** Called after any batch of changes is applied. */
  onChanged?: (files: WorkspaceFiles) => void;

  /** Called when a runtime write fails. */
  onError?: (error: Error, context: { path?: string; operation: string }) => void;
}

export interface SyncConflict {
  path: string;
  resolution: ConflictPolicy;
}

/** Paths that are never part of the product's file tree. */
const IGNORED_SEGMENTS = ['node_modules', '.git'];

export function isIgnoredPath(path: string): boolean {
  const segments = normalizePath(path).split('/');
  return segments.some((segment) => IGNORED_SEGMENTS.includes(segment));
}

export class FileSync {
  readonly files: WorkspaceFiles;

  private _runtime: CudeRuntime;
  private _options: FileSyncOptions;
  private _unwatch: (() => void) | null = null;
  private _disposed = false;

  /** Paths written locally, awaiting their echo from the runtime. */
  private _pendingWrites = new Map<string, string>();

  /** Conflicts observed since the last read, for the UI to surface. */
  private _conflicts: SyncConflict[] = [];

  constructor(runtime: CudeRuntime, initial: WorkspaceFileMap = {}, options: FileSyncOptions = {}) {
    this._runtime = runtime;
    this._options = options;
    this.files = new WorkspaceFiles(initial);
  }

  get conflicts(): SyncConflict[] {
    return [...this._conflicts];
  }

  clearConflicts(): void {
    this._conflicts = [];
  }

  /** Replace the workspace with this project and start watching it. */
  async mount(project: WorkspaceFile[]): Promise<void> {
    this._assertLive();

    const writable = project.filter((file) => !isIgnoredPath(file.path));
    this._pendingWrites.clear();
    this.files.replaceAll(writable);

    for (const file of writable) {
      this._pendingWrites.set(normalizePath(file.path), file.contents);
    }

    try {
      await this._runtime.mountProject(writable);
    } catch (error) {
      this._reportError(error, { operation: 'mount' });
    }

    this.watch();
    this._notify();
  }

  /** Start applying runtime changes. Safe to call more than once. */
  watch(): void {
    this._assertLive();

    if (this._unwatch) {
      return;
    }

    this._unwatch = this._runtime.watchFiles((changes) => this.applyRuntimeChanges(changes));
  }

  /** Stop applying runtime changes. */
  unwatch(): void {
    this._unwatch?.();
    this._unwatch = null;
  }

  /**
   * Save a file: update the model, then write it through to the runtime.
   *
   * Refused for locked paths, and the runtime is not touched in that case —
   * a lock that only stopped the UI would still let the file change on disk.
   */
  async save(path: string, content: string): Promise<boolean> {
    this._assertLive();

    if (this.files.isLocked(path).locked) {
      return false;
    }

    if (!this.files.writeFile(path, content)) {
      return false;
    }

    const normalized = normalizePath(path);
    this._pendingWrites.set(normalized, content);

    try {
      await this._runtime.writeFiles([{ path: normalized, contents: content }]);
      this.files.markAsSaved(normalized);
    } catch (error) {
      this._pendingWrites.delete(normalized);
      this._reportError(error, { path: normalized, operation: 'save' });

      return false;
    }

    this._notify();

    return true;
  }

  /**
   * Create a folder locally. Folders exist in the model; the runtime
   * materializes them when a file is written into one.
   */
  createFolder(path: string): void {
    this._assertLive();
    this.files.createFolder(path);
    this._notify();
  }

  /** Remove a path from the model. Locked paths are refused. */
  remove(path: string): string[] {
    this._assertLive();

    if (this.files.isLocked(path).locked) {
      return [];
    }

    const removed = this.files.remove(path);

    if (removed.length > 0) {
      this._notify();
    }

    return removed;
  }

  /**
   * Apply a batch of runtime changes to the model.
   *
   * Exposed rather than private so the behaviour can be driven directly in
   * tests without a watcher and without timing.
   */
  applyRuntimeChanges(changes: FileChange[]): void {
    if (this._disposed) {
      return;
    }

    let applied = false;

    for (const change of changes) {
      if (isIgnoredPath(change.path)) {
        continue;
      }

      const path = normalizePath(change.path);

      if (this._isOwnEcho(path, change)) {
        this._pendingWrites.delete(path);
        continue;
      }

      if (change.kind === 'removed') {
        if (this.files.get(path)) {
          this.files.remove(path);
          applied = true;
        }

        continue;
      }

      if (change.isDirectory) {
        if (!this.files.get(path)) {
          this.files.createFolder(path);
          applied = true;
        }

        continue;
      }

      if (change.contents === undefined) {
        // A file the runtime could not decode: record it as binary.
        if (!this.files.getFile(path)) {
          this.files.writeFile(path, '', { isBinary: true });
          applied = true;
        }

        continue;
      }

      if (this._resolveConflict(path, change.contents)) {
        applied = true;
      }
    }

    if (applied) {
      this._notify();
    }
  }

  /** True when this change is the runtime echoing back what we just wrote. */
  private _isOwnEcho(path: string, change: FileChange): boolean {
    if (!this._pendingWrites.has(path)) {
      return false;
    }

    return change.kind !== 'removed' && change.contents === this._pendingWrites.get(path);
  }

  /**
   * Apply an external change, honouring the conflict policy.
   *
   * Returns true when the model changed.
   */
  private _resolveConflict(path: string, contents: string): boolean {
    const existing = this.files.getFile(path);

    if (existing?.content === contents) {
      return false;
    }

    if (existing && this.files.isModified(path)) {
      const policy = this._options.conflictPolicy ?? 'keep-local';
      this._conflicts.push({ path, resolution: policy });

      if (policy === 'keep-local') {
        return false;
      }
    }

    if (!this.files.writeFile(path, contents)) {
      // Locked; the model is authoritative and the runtime change is ignored.
      return false;
    }

    this.files.markAsSaved(path);

    return true;
  }

  private _notify(): void {
    this._options.onChanged?.(this.files);
  }

  private _reportError(error: unknown, context: { path?: string; operation: string }): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    if (this._options.onError) {
      this._options.onError(normalized, context);
      return;
    }

    throw normalized;
  }

  private _assertLive(): void {
    if (this._disposed) {
      throw new Error('FileSync has been disposed');
    }
  }

  /** Stop watching and release everything. Safe to call twice. */
  dispose(): void {
    this.unwatch();
    this._pendingWrites.clear();
    this._conflicts = [];
    this._disposed = true;
  }
}

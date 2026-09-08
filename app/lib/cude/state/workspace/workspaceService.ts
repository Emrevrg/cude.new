/**
 * Cude.new - workspace service.
 *
 * The workspace boundary the rest of the product talks to: what files exist,
 * reading and saving them, locking, and what has changed. It owns a `FileSync`
 * and exposes a reactive view for the UI.
 *
 * This is the seam the workbench sits behind. The inherited arrangement had the
 * workbench construct a file store directly and reach into it from twenty-odd
 * places, which meant the workbench could not exist without a browser container
 * and the file logic could not be tested without the workbench.
 */

import { atom, map } from 'nanostores';
import type { CudeRuntime, WorkspaceFile } from '~/lib/cude/runtime/types';
import { FileSync, type ConflictPolicy } from './fileSync';
import { normalizePath, type WorkspaceFileMap, type WorkspaceFileNode } from './fileModel';
import { computeFileModifications } from '~/utils/diff';

export interface WorkspaceServiceOptions {
  conflictPolicy?: ConflictPolicy;
  onError?: (error: Error, context: { path?: string; operation: string }) => void;
}

export class WorkspaceService {
  /** Reactive file map, for components. */
  readonly files = map<WorkspaceFileMap>({});

  /** Paths the current build has changed, for the tree and the diff surface. */
  readonly changedByBuild = atom<ReadonlySet<string>>(new Set<string>());

  private _sync: FileSync;
  private _options: WorkspaceServiceOptions;

  constructor(runtime: CudeRuntime, options: WorkspaceServiceOptions = {}) {
    this._options = options;
    this._sync = new FileSync(
      runtime,
      {},
      {
        conflictPolicy: options.conflictPolicy,
        onError: options.onError,
        onChanged: (files) => {
          this.files.set(files.map);
          this.changedByBuild.set(new Set(files.changedSinceBuild()));
        },
      },
    );
  }

  /** Number of files, folders excluded. */
  get fileCount(): number {
    return this._sync.files.fileCount;
  }

  /** Unresolved sync conflicts, for the UI to surface. */
  get conflicts() {
    return this._sync.conflicts;
  }

  async mount(project: WorkspaceFile[]): Promise<void> {
    await this._sync.mount(project);
    this.files.set(this._sync.files.map);
  }

  getFile(path: string): WorkspaceFileNode | undefined {
    return this._sync.files.getFile(path);
  }

  async saveFile(path: string, content: string): Promise<boolean> {
    return this._sync.save(path, content);
  }

  /** Create a file. Binary seed content is recorded without text. */
  async createFile(path: string, content: string | Uint8Array = ''): Promise<boolean> {
    if (typeof content !== 'string') {
      this._sync.files.writeFile(path, '', { isBinary: true });
      this.files.set(this._sync.files.map);

      return true;
    }

    return this._sync.save(path, content);
  }

  createFolder(path: string): void {
    this._sync.createFolder(path);
    this.files.set(this._sync.files.map);
  }

  /** Remove a file or folder. Returns the paths that went away. */
  remove(path: string): string[] {
    const removed = this._sync.remove(path);
    this.files.set(this._sync.files.map);

    return removed;
  }

  // --- locking -----------------------------------------------------------

  /** Lock a path. Returns false when the path does not exist. */
  lock(path: string): boolean {
    if (!this._sync.files.get(path)) {
      return false;
    }

    this._sync.files.lock(path);
    this.files.set(this._sync.files.map);

    return true;
  }

  /** Unlock a path. Returns false when the path does not exist. */
  unlock(path: string): boolean {
    if (!this._sync.files.get(path)) {
      return false;
    }

    this._sync.files.unlock(path);
    this.files.set(this._sync.files.map);

    return true;
  }

  isLocked(path: string): { locked: boolean; lockedBy?: string } {
    return this._sync.files.isLocked(path);
  }

  lockedPaths(): string[] {
    return this._sync.files.lockedPaths();
  }

  // --- modifications ------------------------------------------------------

  /** Files changed since the last save, keyed by path. */
  modifiedFiles(): Record<string, WorkspaceFileNode> | undefined {
    const modified = this._sync.files.modifiedFiles();

    if (modified.length === 0) {
      return undefined;
    }

    const out: Record<string, WorkspaceFileNode> = {};

    for (const entry of modified) {
      const node = this._sync.files.getFile(entry.path);

      if (node) {
        out[entry.path] = node;
      }
    }

    return out;
  }

  // --- build baseline -----------------------------------------------------

  /** Mark the current contents as the point this build's changes start from. */
  beginBuild(): void {
    this._sync.files.beginBuild();
    this.changedByBuild.set(new Set());
  }

  /** What a file held when the build began. */
  baselineFor(path: string): string | undefined {
    return this._sync.files.baselineFor(path);
  }

  /** Diff-shaped modifications, for the model context and the Diff surface. */
  fileModifications() {
    const original = new Map<string, string>();

    for (const entry of this._sync.files.modifiedFiles()) {
      original.set(normalizePath(entry.path), entry.before);
    }

    return computeFileModifications(this.files.get(), original);
  }

  /** Treat everything as saved. */
  resetModifications(): void {
    this._sync.files.markAllAsSaved();
    this.files.set(this._sync.files.map);
  }

  /**
   * Move the workspace onto a different runtime, carrying its files across.
   *
   * The workbench is constructed during module evaluation, before a container
   * can exist, so it starts on the in-memory runtime and is upgraded once the
   * real one is ready. Doing it this way keeps construction synchronous and
   * keeps a container from being booted as an import side effect.
   */
  async attachRuntime(runtime: CudeRuntime): Promise<void> {
    const carried: WorkspaceFile[] = [];

    for (const [path, node] of Object.entries(this._sync.files.map)) {
      if (node?.type === 'file' && !node.isBinary) {
        carried.push({ path, contents: node.content });
      }
    }

    const locked = this._sync.files.lockedPaths();

    this._sync.dispose();
    this._sync = new FileSync(
      runtime,
      {},
      {
        conflictPolicy: this._options.conflictPolicy,
        onError: this._options.onError,
        onChanged: (files) => this.files.set(files.map),
      },
    );

    await this._sync.mount(carried);

    for (const path of locked) {
      this._sync.files.lock(path);
    }

    this.files.set(this._sync.files.map);
  }

  /** Stop watching and release everything. */
  dispose(): void {
    this._sync.dispose();
  }
}

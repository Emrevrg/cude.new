/**
 * Cude.new - workspace file model.
 *
 * The pure half of the workspace: what files exist, what they contain, which
 * are locked, and what has changed since the project was mounted. No container,
 * no watcher, no persistence — those live in the layers around this one.
 *
 * Separating them is the point. The inherited store put the file map, lock
 * bookkeeping, modification tracking and the container's file watcher in one
 * 951-line class whose constructor took a live container promise, so none of
 * this logic could be exercised without booting a browser runtime.
 */

export interface WorkspaceFileNode {
  type: 'file';
  content: string;
  isBinary: boolean;

  /** Locked directly, or inherited from a locked ancestor folder. */
  isLocked?: boolean;

  /** Folder whose lock covers this entry, when the lock was inherited. */
  lockedByFolder?: string;
}

export interface WorkspaceFolderNode {
  type: 'folder';
  isLocked?: boolean;
  lockedByFolder?: string;
}

export type WorkspaceNode = WorkspaceFileNode | WorkspaceFolderNode;

/** Path to node. A `undefined` value marks a path that was deleted. */
export type WorkspaceFileMap = Record<string, WorkspaceNode | undefined>;

export interface ModifiedFile {
  path: string;
  before: string;
  after: string;
}

/** Normalize to a POSIX path with no trailing slash. Root stays `/`. */
export function normalizePath(path: string): string {
  const posix = path
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/');
  return posix ? `/${posix}` : '/';
}

/** Immediate parent of a path, or null for the root. */
export function parentPath(path: string): string | null {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return null;
  }

  const cut = normalized.lastIndexOf('/');

  return cut <= 0 ? '/' : normalized.slice(0, cut);
}

/** Every ancestor of a path, nearest first. */
export function ancestorPaths(path: string): string[] {
  const out: string[] = [];
  let current = parentPath(path);

  while (current) {
    out.push(current);
    current = parentPath(current);
  }

  return out;
}

/** True when `candidate` is inside `folder`. */
export function isInsideFolder(candidate: string, folder: string): boolean {
  const normalizedFolder = normalizePath(folder);
  const normalizedCandidate = normalizePath(candidate);

  if (normalizedFolder === '/') {
    return normalizedCandidate !== '/';
  }

  return normalizedCandidate.startsWith(`${normalizedFolder}/`);
}

/**
 * The workspace file map, with the operations the product performs on it.
 *
 * Every mutation returns a new map rather than editing in place, so a caller
 * can diff two states — which is what the Diff surface needs and what the
 * inherited mutable store made awkward.
 */
export class WorkspaceFiles {
  private _files: WorkspaceFileMap = {};

  /** Content as it was when the project was mounted, for modification tracking. */
  private _original = new Map<string, string>();

  /*
   * What each file held when the current build began. Separate from the saved
   * baseline: "you have unsaved edits" and "this build changed this file" are
   * different questions, and the diff surface asks the second one.
   */
  private _buildBaseline = new Map<string, string>();
  private _building = false;

  constructor(initial: WorkspaceFileMap = {}) {
    for (const [path, node] of Object.entries(initial)) {
      if (node) {
        this._files[normalizePath(path)] = node;
      }
    }

    this.markAllAsSaved();
  }

  get map(): WorkspaceFileMap {
    return { ...this._files };
  }

  /** Number of files, not counting folders. */
  get fileCount(): number {
    return Object.values(this._files).filter((node) => node?.type === 'file').length;
  }

  get(path: string): WorkspaceNode | undefined {
    return this._files[normalizePath(path)];
  }

  getFile(path: string): WorkspaceFileNode | undefined {
    const node = this.get(path);
    return node?.type === 'file' ? node : undefined;
  }

  /** Replace every node with a new project and reset its saved baseline. */
  replaceAll(files: Array<{ path: string; contents: string }>): void {
    this._files = {};
    this._original.clear();
    this._buildBaseline.clear();
    this._building = false;

    for (const file of files) {
      this.writeFile(file.path, file.contents);
    }

    this.markAllAsSaved();
  }

  /** Paths of everything directly inside a folder, sorted. */
  childrenOf(folder: string): string[] {
    const normalized = normalizePath(folder);

    return Object.keys(this._files)
      .filter((path) => parentPath(path) === normalized)
      .sort();
  }

  /** Create the folder entries a path implies, so the tree is never sparse. */
  private _ensureFolders(path: string): void {
    for (const ancestor of ancestorPaths(path)) {
      if (ancestor === '/') {
        continue;
      }

      if (!this._files[ancestor]) {
        this._files[ancestor] = { type: 'folder' };
      }
    }
  }

  /** Add or replace a file. Locked files are refused. */
  writeFile(path: string, content: string, options: { isBinary?: boolean } = {}): boolean {
    const normalized = normalizePath(path);

    if (this.isLocked(normalized).locked) {
      return false;
    }

    this._ensureFolders(normalized);
    this._files[normalized] = {
      type: 'file',
      content,
      isBinary: options.isBinary ?? false,
    };

    return true;
  }

  createFolder(path: string): void {
    const normalized = normalizePath(path);
    this._ensureFolders(normalized);
    this._files[normalized] = { type: 'folder' };
  }

  /** Remove a path. Removing a folder removes everything under it. */
  remove(path: string): string[] {
    const normalized = normalizePath(path);
    const node = this._files[normalized];

    if (!node) {
      return [];
    }

    const removed: string[] = [normalized];

    if (node.type === 'folder') {
      for (const candidate of Object.keys(this._files)) {
        if (isInsideFolder(candidate, normalized)) {
          removed.push(candidate);
        }
      }
    }

    for (const target of removed) {
      delete this._files[target];
      this._original.delete(target);
    }

    return removed.sort();
  }

  // --- locking -----------------------------------------------------------

  /** Lock a single file or folder. */
  lock(path: string): void {
    const normalized = normalizePath(path);
    const node = this._files[normalized];

    if (!node) {
      return;
    }

    this._files[normalized] = { ...node, isLocked: true, lockedByFolder: undefined };

    if (node.type === 'folder') {
      this._applyFolderLock(normalized, true);
    }
  }

  unlock(path: string): void {
    const normalized = normalizePath(path);
    const node = this._files[normalized];

    if (!node) {
      return;
    }

    this._files[normalized] = { ...node, isLocked: false, lockedByFolder: undefined };

    if (node.type === 'folder') {
      this._applyFolderLock(normalized, false);
    }
  }

  private _applyFolderLock(folder: string, locked: boolean): void {
    for (const [path, node] of Object.entries(this._files)) {
      if (!node || !isInsideFolder(path, folder)) {
        continue;
      }

      /*
       * An entry locked in its own right is left alone in both directions: the
       * folder lock must not overwrite its provenance, or unlocking the folder
       * would release a lock the user set explicitly.
       */
      const lockedInOwnRight = node.isLocked && node.lockedByFolder === undefined;

      if (lockedInOwnRight) {
        continue;
      }

      if (!locked && node.isLocked && node.lockedByFolder !== folder) {
        // Inherited from a different (still locked) ancestor.
        continue;
      }

      this._files[path] = locked
        ? { ...node, isLocked: true, lockedByFolder: folder }
        : { ...node, isLocked: false, lockedByFolder: undefined };
    }
  }

  /** Whether a path is locked, and what locked it. */
  isLocked(path: string): { locked: boolean; lockedBy?: string } {
    const normalized = normalizePath(path);
    const node = this._files[normalized];

    if (node?.isLocked) {
      return { locked: true, lockedBy: node.lockedByFolder ?? normalized };
    }

    // A path can be covered by an ancestor lock even before it is materialized.
    for (const ancestor of ancestorPaths(normalized)) {
      const folder = this._files[ancestor];

      if (folder?.type === 'folder' && folder.isLocked) {
        return { locked: true, lockedBy: ancestor };
      }
    }

    return { locked: false };
  }

  lockedPaths(): string[] {
    return Object.entries(this._files)
      .filter(([, node]) => node?.isLocked)
      .map(([path]) => path)
      .sort();
  }

  // --- modification tracking ---------------------------------------------

  /** Treat the current contents as the saved baseline. */
  markAllAsSaved(): void {
    this._original.clear();

    for (const [path, node] of Object.entries(this._files)) {
      if (node?.type === 'file' && !node.isBinary) {
        this._original.set(path, node.content);
      }
    }
  }

  markAsSaved(path: string): void {
    const node = this.getFile(path);

    if (node && !node.isBinary) {
      this._original.set(normalizePath(path), node.content);
    }
  }

  // --- build baseline -----------------------------------------------------

  /**
   * Mark the current contents as the point a build's changes are measured from.
   *
   * Files created after this call have no entry, and are reported as changed
   * against an empty original — which is what a newly written file is.
   */
  beginBuild(): void {
    this._buildBaseline.clear();
    this._building = true;

    for (const [path, node] of Object.entries(this._files)) {
      if (node?.type === 'file' && !node.isBinary) {
        this._buildBaseline.set(path, node.content);
      }
    }
  }

  /** True once a build has established a baseline. */
  get isBuilding(): boolean {
    return this._building;
  }

  /** What a file held when the build began, or '' if the build created it. */
  baselineFor(path: string): string | undefined {
    if (!this._building) {
      return undefined;
    }

    const normalized = normalizePath(path);
    const node = this.getFile(normalized);

    if (!node || node.isBinary) {
      return undefined;
    }

    return this._buildBaseline.get(normalized) ?? '';
  }

  /** Paths this build has changed. */
  changedSinceBuild(): string[] {
    if (!this._building) {
      return [];
    }

    const changed: string[] = [];

    for (const [path, node] of Object.entries(this._files)) {
      if (node?.type !== 'file' || node.isBinary) {
        continue;
      }

      if ((this._buildBaseline.get(path) ?? '') !== node.content) {
        changed.push(path);
      }
    }

    return changed.sort();
  }

  /** Files whose content differs from the saved baseline. */
  modifiedFiles(): ModifiedFile[] {
    const out: ModifiedFile[] = [];

    for (const [path, before] of this._original) {
      const node = this.getFile(path);

      if (node && !node.isBinary && node.content !== before) {
        out.push({ path, before, after: node.content });
      }
    }

    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  isModified(path: string): boolean {
    const normalized = normalizePath(path);
    const node = this.getFile(normalized);

    if (!node || node.isBinary) {
      return false;
    }

    return this._original.has(normalized) && this._original.get(normalized) !== node.content;
  }

  /** Restore every file to its saved baseline. */
  revertAll(): void {
    for (const [path, content] of this._original) {
      const node = this.getFile(path);

      if (node) {
        this._files[path] = { ...node, content };
      }
    }
  }
}

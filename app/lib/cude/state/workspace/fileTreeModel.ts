/**
 * Cude.new - turning a flat file map into a tree.
 *
 * A workspace is stored as paths; a file tree is a nested, ordered, partly
 * collapsed thing. The conversion is pure arithmetic on strings, so it lives
 * here where it can be tested, rather than inside a component where the only
 * way to check the ordering rules is to look at them.
 *
 * The output is a flat list with a depth on each entry. A flat list is what the
 * component actually renders, and it makes "which rows are hidden because an
 * ancestor is collapsed" a filter rather than a tree walk.
 */

import type { WorkspaceFileMap } from './fileModel';

export interface TreeNode {
  kind: 'file' | 'folder';

  /** Full path, unique, and the identity used for selection and collapse. */
  path: string;
  name: string;
  depth: number;
}

export interface BuildTreeOptions {
  /** Path everything is relative to. */
  root?: string;

  /** Leave the root itself out of the list. */
  hideRoot?: boolean;

  /** Paths matching any of these are left out, along with their contents. */
  hidden?: Array<string | RegExp>;
}

/** Files and folders Cude hides unless asked otherwise. */
export const DEFAULT_HIDDEN: Array<string | RegExp> = [/\/node_modules\//, /\/\.git\//, /\/dist\//, /\/\.next\//];

export function isHidden(fullPath: string, name: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) => (typeof pattern === 'string' ? pattern === name : pattern.test(fullPath)));
}

/**
 * Folders before files, then by name.
 *
 * Case-insensitive, and numbers compare as numbers so `item10` sorts after
 * `item9` — a plain string sort puts it between `item1` and `item2`, which
 * looks like a bug every time someone notices it.
 */
export function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

interface MutableNode extends TreeNode {
  children: MutableNode[];
}

/**
 * Build the ordered, flattened tree.
 *
 * Folders are inferred from the paths of the files inside them: the workspace
 * map holds entries for directories too, but a directory whose entry is missing
 * still has to appear, or its files have nowhere to hang.
 */
export function buildTree(files: WorkspaceFileMap, options: BuildTreeOptions = {}): TreeNode[] {
  const { root = '/', hideRoot = false, hidden = DEFAULT_HIDDEN } = options;

  const rootNode: MutableNode = { kind: 'folder', path: root, name: root, depth: 0, children: [] };
  const folders = new Map<string, MutableNode>([[root, rootNode]]);

  const prefix = root === '/' ? '/' : `${root.replace(/\/+$/, '')}/`;

  const ensureFolder = (path: string, name: string, depth: number): MutableNode => {
    const existing = folders.get(path);

    if (existing) {
      return existing;
    }

    const node: MutableNode = { kind: 'folder', path, name, depth, children: [] };
    folders.set(path, node);

    return node;
  };

  for (const [fullPath, entry] of Object.entries(files)) {
    if (!entry || !fullPath.startsWith(prefix)) {
      continue;
    }

    const relative = fullPath.slice(prefix.length);
    const segments = relative.split('/').filter(Boolean);

    if (segments.length === 0) {
      continue;
    }

    const name = segments[segments.length - 1];

    if (isHidden(fullPath, name, hidden)) {
      continue;
    }

    /*
     * Walk the ancestors, creating any folder that has not been seen. A folder
     * entry in the map arrives here the same way, and lands in `folders`
     * without a duplicate because the path is the key.
     */
    let parent = rootNode;
    let path = root === '/' ? '' : root.replace(/\/+$/, '');

    for (let index = 0; index < segments.length - 1; index += 1) {
      path = `${path}/${segments[index]}`;

      const folder = ensureFolder(path, segments[index], index + 1);

      if (!parent.children.includes(folder)) {
        parent.children.push(folder);
      }

      parent = folder;
    }

    const leafPath = `${path}/${name}`;

    if (entry.type === 'folder') {
      const folder = ensureFolder(leafPath, name, segments.length);

      if (!parent.children.includes(folder)) {
        parent.children.push(folder);
      }

      continue;
    }

    parent.children.push({ kind: 'file', path: leafPath, name, depth: segments.length, children: [] });
  }

  const flat: TreeNode[] = [];

  const walk = (node: MutableNode) => {
    for (const child of [...node.children].sort(compareNodes)) {
      flat.push({ kind: child.kind, path: child.path, name: child.name, depth: child.depth });
      walk(child);
    }
  };

  if (!hideRoot && root === '/') {
    flat.push({ kind: 'folder', path: root, name: root, depth: 0 });
  }

  walk(rootNode);

  return flat;
}

/**
 * Drop the rows whose ancestor is collapsed.
 *
 * Done on the flat list rather than by not building those nodes, so collapsing
 * a folder does not throw away the tree and rebuild it.
 */
export function visibleNodes(nodes: TreeNode[], collapsed: ReadonlySet<string>): TreeNode[] {
  if (collapsed.size === 0) {
    return nodes;
  }

  return nodes.filter((node) => {
    for (const folder of collapsed) {
      if (node.path !== folder && node.path.startsWith(`${folder}/`)) {
        return false;
      }
    }

    return true;
  });
}

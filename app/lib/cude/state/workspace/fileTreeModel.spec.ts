/**
 * Cude.new - building the file tree.
 *
 * Ordering and hiding rules are the sort of thing that is obviously right when
 * you write it and quietly wrong six files later, so they are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { buildTree, visibleNodes, compareNodes, isHidden, DEFAULT_HIDDEN, type TreeNode } from './fileTreeModel';
import type { WorkspaceFileMap } from './fileModel';

function file(content = ''): { type: 'file'; content: string; isBinary: boolean } {
  return { type: 'file', content, isBinary: false };
}

const FILES: WorkspaceFileMap = {
  '/home/project/package.json': file(),
  '/home/project/src/App.tsx': file(),
  '/home/project/src/components/Nav.tsx': file(),
  '/home/project/src/components/ui.tsx': file(),
  '/home/project/README.md': file(),
};

function paths(nodes: TreeNode[]): string[] {
  return nodes.map((node) => node.path);
}

describe('building', () => {
  it('lists every file under the root', () => {
    const tree = buildTree(FILES, { root: '/home/project' });

    expect(paths(tree)).toContain('/home/project/src/App.tsx');
    expect(paths(tree)).toContain('/home/project/README.md');
  });

  it('creates the folders the files imply', () => {
    const tree = buildTree(FILES, { root: '/home/project' });
    const folders = tree.filter((node) => node.kind === 'folder').map((node) => node.path);

    expect(folders).toEqual(['/home/project/src', '/home/project/src/components']);
  });

  it('gives each node its depth below the root', () => {
    const tree = buildTree(FILES, { root: '/home/project' });
    const byPath = Object.fromEntries(tree.map((node) => [node.path, node.depth]));

    expect(byPath['/home/project/package.json']).toBe(1);
    expect(byPath['/home/project/src']).toBe(1);
    expect(byPath['/home/project/src/components/Nav.tsx']).toBe(3);
  });

  it('does not duplicate a folder that also has its own entry', () => {
    const withFolder: WorkspaceFileMap = { ...FILES, '/home/project/src': { type: 'folder' } };
    const tree = buildTree(withFolder, { root: '/home/project' });

    expect(tree.filter((node) => node.path === '/home/project/src')).toHaveLength(1);
  });

  it('shows an empty folder that has an entry of its own', () => {
    const tree = buildTree({ '/home/project/empty': { type: 'folder' } }, { root: '/home/project' });

    expect(paths(tree)).toEqual(['/home/project/empty']);
  });

  it('ignores paths outside the root', () => {
    const tree = buildTree({ ...FILES, '/elsewhere/other.ts': file() }, { root: '/home/project' });

    expect(paths(tree).some((path) => path.startsWith('/elsewhere'))).toBe(false);
  });

  it('ignores an entry that is missing', () => {
    const tree = buildTree({ '/home/project/gone.ts': undefined }, { root: '/home/project' });

    expect(tree).toHaveLength(0);
  });

  it('returns nothing for an empty workspace', () => {
    expect(buildTree({}, { root: '/home/project' })).toEqual([]);
  });
});

describe('ordering', () => {
  it('puts folders before files', () => {
    const tree = buildTree(FILES, { root: '/home/project' });

    expect(tree[0].path).toBe('/home/project/src');
  });

  it('sorts names case-insensitively', () => {
    const tree = buildTree({ '/p/b.ts': file(), '/p/A.ts': file(), '/p/c.ts': file() }, { root: '/p', hideRoot: true });

    expect(tree.map((node) => node.name)).toEqual(['A.ts', 'b.ts', 'c.ts']);
  });

  it('sorts numbers as numbers, so item10 follows item9', () => {
    const tree = buildTree(
      { '/p/item10.ts': file(), '/p/item9.ts': file(), '/p/item1.ts': file() },
      { root: '/p', hideRoot: true },
    );

    expect(tree.map((node) => node.name)).toEqual(['item1.ts', 'item9.ts', 'item10.ts']);
  });

  it('lists a folder’s contents directly after it', () => {
    const tree = buildTree(FILES, { root: '/home/project' });

    expect(paths(tree)).toEqual([
      '/home/project/src',
      '/home/project/src/components',
      '/home/project/src/components/Nav.tsx',
      '/home/project/src/components/ui.tsx',
      '/home/project/src/App.tsx',

      // Case-insensitive, so package.json precedes README.md.
      '/home/project/package.json',
      '/home/project/README.md',
    ]);
  });

  it('compares two nodes of the same kind by name', () => {
    const a: TreeNode = { kind: 'file', path: '/a', name: 'a', depth: 1 };
    const b: TreeNode = { kind: 'file', path: '/b', name: 'b', depth: 1 };

    expect(compareNodes(a, b)).toBeLessThan(0);
  });
});

describe('hiding', () => {
  it('leaves out installed dependencies by default', () => {
    const tree = buildTree(
      { ...FILES, '/home/project/node_modules/react/index.js': file() },
      { root: '/home/project' },
    );

    expect(paths(tree).some((path) => path.includes('node_modules'))).toBe(false);
  });

  it('leaves out build output by default', () => {
    const tree = buildTree({ '/p/dist/app.js': file(), '/p/src/App.tsx': file() }, { root: '/p', hideRoot: true });

    expect(paths(tree)).toEqual(['/p/src', '/p/src/App.tsx']);
  });

  it('matches a plain string against the file name', () => {
    expect(isHidden('/p/.env', '.env', ['.env'])).toBe(true);
    expect(isHidden('/p/env.ts', 'env.ts', ['.env'])).toBe(false);
  });

  it('matches a pattern against the whole path', () => {
    expect(isHidden('/p/node_modules/x/y.js', 'y.js', DEFAULT_HIDDEN)).toBe(true);
  });

  it('keeps project metadata folders visible for reproducible builds', () => {
    const tree = buildTree(
      { '/p/.cude/config.json': file(), '/p/src/App.tsx': file() },
      { root: '/p', hideRoot: true },
    );

    expect(paths(tree)).toEqual(['/p/.cude', '/p/.cude/config.json', '/p/src', '/p/src/App.tsx']);
  });

  it('hides nothing when given no patterns', () => {
    const tree = buildTree({ '/p/node_modules/react/index.js': file() }, { root: '/p', hideRoot: true, hidden: [] });

    expect(paths(tree)).toContain('/p/node_modules/react/index.js');
  });
});

describe('collapsing', () => {
  const tree = buildTree(FILES, { root: '/home/project' });

  it('returns everything when nothing is collapsed', () => {
    expect(visibleNodes(tree, new Set())).toHaveLength(tree.length);
  });

  it('hides the contents of a collapsed folder', () => {
    const visible = paths(visibleNodes(tree, new Set(['/home/project/src'])));

    expect(visible).toContain('/home/project/src');
    expect(visible).not.toContain('/home/project/src/App.tsx');
    expect(visible).not.toContain('/home/project/src/components/Nav.tsx');
  });

  it('keeps siblings of a collapsed folder', () => {
    const visible = paths(visibleNodes(tree, new Set(['/home/project/src'])));

    expect(visible).toContain('/home/project/README.md');
  });

  it('does not hide a folder whose name merely starts the same', () => {
    const nodes = buildTree({ '/p/src/a.ts': file(), '/p/src-extra/b.ts': file() }, { root: '/p', hideRoot: true });
    const visible = paths(visibleNodes(nodes, new Set(['/p/src'])));

    expect(visible).toContain('/p/src-extra/b.ts');
    expect(visible).not.toContain('/p/src/a.ts');
  });
});

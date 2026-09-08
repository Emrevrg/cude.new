/**
 * Cude.new - workspace file model behaviour.
 *
 * All of this was previously unreachable by tests: the inherited store required
 * a live browser container in its constructor, so locking, modification
 * tracking and folder semantics were only ever exercised by hand.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkspaceFiles,
  normalizePath,
  parentPath,
  ancestorPaths,
  isInsideFolder,
  type WorkspaceFileMap,
} from './fileModel';

function project(): WorkspaceFileMap {
  return {
    '/package.json': { type: 'file', content: '{}', isBinary: false },
    '/src': { type: 'folder' },
    '/src/App.tsx': { type: 'file', content: 'v1', isBinary: false },
    '/src/lib': { type: 'folder' },
    '/src/lib/util.ts': { type: 'file', content: 'export const a = 1;', isBinary: false },
  };
}

describe('paths', () => {
  it('normalizes to a rooted POSIX path', () => {
    expect(normalizePath('src/App.tsx')).toBe('/src/App.tsx');
    expect(normalizePath('/src/App.tsx')).toBe('/src/App.tsx');
    expect(normalizePath('/src//App.tsx')).toBe('/src/App.tsx');
    expect(normalizePath('/src/')).toBe('/src');
    expect(normalizePath('/')).toBe('/');
  });

  it('accepts Windows separators, because generated projects use both', () => {
    expect(normalizePath('src\\components\\Nav.tsx')).toBe('/src/components/Nav.tsx');
  });

  it('reports the parent, and null at the root', () => {
    expect(parentPath('/src/App.tsx')).toBe('/src');
    expect(parentPath('/src')).toBe('/');
    expect(parentPath('/')).toBeNull();
  });

  it('lists ancestors nearest first', () => {
    expect(ancestorPaths('/src/lib/util.ts')).toEqual(['/src/lib', '/src', '/']);
  });

  it('knows containment without matching a sibling prefix', () => {
    expect(isInsideFolder('/src/App.tsx', '/src')).toBe(true);

    // "/srcextra" must not count as being inside "/src".
    expect(isInsideFolder('/srcextra/App.tsx', '/src')).toBe(false);
    expect(isInsideFolder('/src', '/src')).toBe(false);
  });
});

describe('file map', () => {
  let files: WorkspaceFiles;

  beforeEach(() => {
    files = new WorkspaceFiles(project());
  });

  it('reads files back', () => {
    expect(files.getFile('/src/App.tsx')?.content).toBe('v1');
    expect(files.getFile('/nope.ts')).toBeUndefined();
  });

  it('does not mistake a folder for a file', () => {
    expect(files.getFile('/src')).toBeUndefined();
    expect(files.get('/src')?.type).toBe('folder');
  });

  it('lists direct children only', () => {
    expect(files.childrenOf('/src')).toEqual(['/src/App.tsx', '/src/lib']);
  });

  it('creates the folders a new path implies', () => {
    files.writeFile('/src/deep/nested/thing.ts', 'x');

    expect(files.get('/src/deep')?.type).toBe('folder');
    expect(files.get('/src/deep/nested')?.type).toBe('folder');
    expect(files.getFile('/src/deep/nested/thing.ts')?.content).toBe('x');
  });

  it('counts files without counting folders', () => {
    expect(files.fileCount).toBe(3);
  });

  it('removes a folder and everything under it', () => {
    const removed = files.remove('/src');

    expect(removed).toEqual(['/src', '/src/App.tsx', '/src/lib', '/src/lib/util.ts']);
    expect(files.getFile('/src/lib/util.ts')).toBeUndefined();
    expect(files.getFile('/package.json')).toBeDefined();
  });

  it('reports nothing removed for a path that does not exist', () => {
    expect(files.remove('/nope')).toEqual([]);
  });

  it('hands out a copy of the map, not the live object', () => {
    const map = files.map;
    delete map['/package.json'];

    expect(files.getFile('/package.json')).toBeDefined();
  });
});

describe('locking', () => {
  let files: WorkspaceFiles;

  beforeEach(() => {
    files = new WorkspaceFiles(project());
  });

  it('refuses a write to a locked file', () => {
    files.lock('/src/App.tsx');

    expect(files.writeFile('/src/App.tsx', 'v2')).toBe(false);
    expect(files.getFile('/src/App.tsx')?.content).toBe('v1');
  });

  it('locks everything inside a locked folder', () => {
    files.lock('/src');

    expect(files.isLocked('/src/App.tsx')).toEqual({ locked: true, lockedBy: '/src' });
    expect(files.isLocked('/src/lib/util.ts').locked).toBe(true);
    expect(files.isLocked('/package.json').locked).toBe(false);
  });

  it('covers a file created inside a locked folder afterwards', () => {
    files.lock('/src');

    /*
     * The lock is a property of the folder, not a stamp on the files present
     * when it was applied.
     */
    expect(files.isLocked('/src/brand-new.ts')).toEqual({ locked: true, lockedBy: '/src' });
  });

  it('unlocking a folder releases the files it locked', () => {
    files.lock('/src');
    files.unlock('/src');

    expect(files.isLocked('/src/App.tsx').locked).toBe(false);
    expect(files.writeFile('/src/App.tsx', 'v2')).toBe(true);
  });

  it('keeps a file locked in its own right when its folder is unlocked', () => {
    files.lock('/src/App.tsx');
    files.lock('/src');
    files.unlock('/src');

    expect(files.isLocked('/src/App.tsx').locked).toBe(true);
    expect(files.isLocked('/src/lib/util.ts').locked).toBe(false);
  });

  it('lists locked paths', () => {
    files.lock('/package.json');
    files.lock('/src/lib');

    expect(files.lockedPaths()).toContain('/package.json');
    expect(files.lockedPaths()).toContain('/src/lib');
  });

  it('ignores a lock on a path that does not exist', () => {
    files.lock('/nope');
    expect(files.isLocked('/nope').locked).toBe(false);
  });
});

describe('modification tracking', () => {
  let files: WorkspaceFiles;

  beforeEach(() => {
    files = new WorkspaceFiles(project());
  });

  it('reports nothing modified for a freshly mounted project', () => {
    expect(files.modifiedFiles()).toEqual([]);
  });

  it('reports a changed file with both sides', () => {
    files.writeFile('/src/App.tsx', 'v2');

    expect(files.modifiedFiles()).toEqual([{ path: '/src/App.tsx', before: 'v1', after: 'v2' }]);
    expect(files.isModified('/src/App.tsx')).toBe(true);
  });

  it('stops reporting a file once it is saved', () => {
    files.writeFile('/src/App.tsx', 'v2');
    files.markAsSaved('/src/App.tsx');

    expect(files.modifiedFiles()).toEqual([]);
  });

  it('does not track binary files', () => {
    files.writeFile('/logo.png', 'binary-ish', { isBinary: true });
    files.markAllAsSaved();
    files.writeFile('/logo.png', 'different', { isBinary: true });

    expect(files.isModified('/logo.png')).toBe(false);
  });

  it('reverts every file to its saved baseline', () => {
    files.writeFile('/src/App.tsx', 'v2');
    files.writeFile('/src/lib/util.ts', 'changed');
    files.revertAll();

    expect(files.getFile('/src/App.tsx')?.content).toBe('v1');
    expect(files.modifiedFiles()).toEqual([]);
  });

  it('treats a newly created file as unmodified until it is saved and changed', () => {
    files.writeFile('/new.ts', 'first');

    expect(files.isModified('/new.ts')).toBe(false);

    files.markAsSaved('/new.ts');
    files.writeFile('/new.ts', 'second');

    expect(files.isModified('/new.ts')).toBe(true);
  });

  it('forgets a deleted file rather than reporting it as modified forever', () => {
    files.remove('/src/App.tsx');

    expect(files.modifiedFiles()).toEqual([]);
  });
});

describe('the build baseline', () => {
  let files: WorkspaceFiles;

  beforeEach(() => {
    files = new WorkspaceFiles(project());
  });

  it('reports nothing changed before a build starts', () => {
    files.writeFile('/src/App.tsx', 'v2');

    expect(files.changedSinceBuild()).toEqual([]);
    expect(files.baselineFor('/src/App.tsx')).toBeUndefined();
  });

  it('measures against the contents when the build began', () => {
    files.beginBuild();
    files.writeFile('/src/App.tsx', 'v2');

    expect(files.changedSinceBuild()).toEqual(['/src/App.tsx']);
    expect(files.baselineFor('/src/App.tsx')).toBe('v1');
  });

  it('is separate from the saved baseline', () => {
    files.beginBuild();
    files.writeFile('/src/App.tsx', 'v2');
    files.markAsSaved('/src/App.tsx');

    // Saving clears the unsaved marker but not what this build changed.
    expect(files.isModified('/src/App.tsx')).toBe(false);
    expect(files.changedSinceBuild()).toEqual(['/src/App.tsx']);
  });

  it('treats a file the build created as changed from nothing', () => {
    files.beginBuild();
    files.writeFile('/src/New.tsx', 'hello');

    expect(files.changedSinceBuild()).toEqual(['/src/New.tsx']);
    expect(files.baselineFor('/src/New.tsx')).toBe('');
  });

  it('does not report a file the build wrote back unchanged', () => {
    files.beginBuild();
    files.writeFile('/src/App.tsx', 'v2');
    files.writeFile('/src/App.tsx', 'v1');

    expect(files.changedSinceBuild()).toEqual([]);
  });

  it('lists several changes in path order', () => {
    files.beginBuild();
    files.writeFile('/src/lib/util.ts', 'export const a = 2;');
    files.writeFile('/package.json', '{"name":"x"}');

    expect(files.changedSinceBuild()).toEqual(['/package.json', '/src/lib/util.ts']);
  });

  it('starts again when a new build begins', () => {
    files.beginBuild();
    files.writeFile('/src/App.tsx', 'v2');
    files.beginBuild();

    expect(files.changedSinceBuild()).toEqual([]);
    expect(files.baselineFor('/src/App.tsx')).toBe('v2');
  });
});

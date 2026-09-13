import { describe, expect, it } from 'vitest';
import {
  createVirtualWorkspace,
  deleteVirtualPath,
  listVirtualFiles,
  moveVirtualPath,
  readVirtualFile,
  writeVirtualFile,
} from './files';

describe('virtual workspace', () => {
  it('writes and reads immutable files', () => {
    const empty = createVirtualWorkspace();
    const written = writeVirtualFile(empty, { path: 'src/app.ts', content: 'one', mediaType: 'text/typescript' });
    expect(readVirtualFile(written, 'src/app.ts')).toMatchObject({ content: 'one', mediaType: 'text/typescript' });
    expect(readVirtualFile(empty, 'src/app.ts')).toBeUndefined();
    expect(written.version).toBe(1);
    expect(writeVirtualFile(written, { path: 'src/app.ts', content: 'one', mediaType: 'text/typescript' })).toBe(
      written,
    );
  });

  it('moves a file tree atomically and preserves source on collisions', () => {
    const workspace = createVirtualWorkspace([
      { path: 'src/a.ts', content: 'a' },
      { path: 'src/nested/b.ts', content: 'b' },
      { path: 'other/a.ts', content: 'occupied' },
    ]);
    const moved = moveVirtualPath(workspace, 'src', 'lib');
    expect(listVirtualFiles(moved).map((file) => file.path)).toEqual(['lib/a.ts', 'lib/nested/b.ts', 'other/a.ts']);
    expect(() => moveVirtualPath(workspace, 'src', 'other')).toThrow(/overwrite/i);
    expect(readVirtualFile(workspace, 'src/a.ts')?.content).toBe('a');
  });

  it('deletes a complete subtree without prefix collisions', () => {
    const workspace = createVirtualWorkspace([
      { path: 'src/a.ts', content: 'a' },
      { path: 'src/deep/b.ts', content: 'b' },
      { path: 'src-old/c.ts', content: 'c' },
    ]);
    const next = deleteVirtualPath(workspace, 'src');
    expect(listVirtualFiles(next).map((file) => file.path)).toEqual(['src-old/c.ts']);
    expect(deleteVirtualPath(next, 'missing')).toBe(next);
  });
});

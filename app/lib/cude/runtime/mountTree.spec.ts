/**
 * Cude.new - mount tree construction.
 *
 * The pipeline emits flat workspace-relative paths; the container API wants a
 * nested tree. This conversion is the one piece of the WebContainer adapter
 * that is pure logic, so it is tested directly rather than behind a container.
 */

import { describe, it, expect } from 'vitest';
import { buildMountTree } from './webContainerRuntime';

describe('buildMountTree', () => {
  it('nests directories implied by the path', () => {
    const tree = buildMountTree([
      { path: 'package.json', contents: '{}' },
      { path: 'src/App.tsx', contents: 'app' },
      { path: 'src/components/Nav.tsx', contents: 'nav' },
    ]);

    expect(tree).toEqual({
      'package.json': { file: { contents: '{}' } },
      src: {
        directory: {
          'App.tsx': { file: { contents: 'app' } },
          components: {
            directory: {
              'Nav.tsx': { file: { contents: 'nav' } },
            },
          },
        },
      },
    });
  });

  it('merges files that share a directory instead of overwriting it', () => {
    const tree = buildMountTree([
      { path: 'src/a.ts', contents: 'a' },
      { path: 'src/b.ts', contents: 'b' },
    ]);

    const src = (tree.src as { directory: Record<string, unknown> }).directory;

    expect(Object.keys(src).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('normalizes separators and leading slashes before mounting', () => {
    const tree = buildMountTree([{ path: '/src\\deep\\file.ts', contents: 'x' }]);
    const src = (tree.src as { directory: Record<string, unknown> }).directory;
    const deep = (src.deep as { directory: Record<string, unknown> }).directory;

    expect(deep['file.ts']).toEqual({ file: { contents: 'x' } });
  });

  it('refuses a project file that would escape the workspace', () => {
    expect(() => buildMountTree([{ path: '../escape.ts', contents: 'x' }])).toThrow(/escapes the workspace/);
  });

  it('returns an empty tree for an empty project', () => {
    expect(buildMountTree([])).toEqual({});
  });
});

/**
 * Cude.new - exporting the project.
 *
 * This is how someone's work leaves Cude, so the two things that matter are
 * that nothing is silently dropped and that nothing corrupt is written. Binary
 * entries are the corrupt case: the workspace holds them as text it could not
 * decode, and writing that back out produces a broken file.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  collectExportableFiles,
  slugForArchive,
  archiveName,
  buildArchive,
  writeProjectToDirectory,
} from './workspaceExport';
import type { FileMap } from './workspace';
import { WORK_DIR } from '~/lib/cude/constants';

function project(): FileMap {
  return {
    [`${WORK_DIR}/package.json`]: { type: 'file', content: '{}', isBinary: false },
    [`${WORK_DIR}/src`]: { type: 'folder' },
    [`${WORK_DIR}/src/App.tsx`]: { type: 'file', content: 'export default () => null;', isBinary: false },
    [`${WORK_DIR}/logo.png`]: { type: 'file', content: '��', isBinary: true },
  };
}

describe('what goes into an export', () => {
  it('includes the text files', () => {
    expect(collectExportableFiles(project()).map((file) => file.path)).toEqual(['package.json', 'src/App.tsx']);
  });

  it('leaves out folders, which the paths recreate', () => {
    expect(collectExportableFiles(project()).some((file) => file.path === 'src')).toBe(false);
  });

  it('leaves out binary files rather than writing them corrupted', () => {
    expect(collectExportableFiles(project()).some((file) => file.path === 'logo.png')).toBe(false);
  });

  it('reports paths relative to the project root', () => {
    expect(collectExportableFiles(project()).every((file) => !file.path.startsWith('/'))).toBe(true);
  });

  it('is ordered, so two exports of the same project match', () => {
    const paths = collectExportableFiles(project()).map((file) => file.path);

    expect(paths).toEqual([...paths].sort());
  });

  it('returns nothing for an empty workspace', () => {
    expect(collectExportableFiles({})).toEqual([]);
  });

  it('skips a missing entry', () => {
    expect(collectExportableFiles({ [`${WORK_DIR}/gone.ts`]: undefined })).toEqual([]);
  });
});

describe('naming the archive', () => {
  it('uses the project title', () => {
    expect(slugForArchive('Habit Tracker')).toBe('habit-tracker');
  });

  it('replaces anything a filesystem would object to', () => {
    expect(slugForArchive('Invoice / Dashboard: v2!')).toBe('invoice-dashboard-v2');
  });

  it('falls back when there is no title', () => {
    expect(slugForArchive(undefined)).toBe('project');
    expect(slugForArchive('  ')).toBe('project');
    expect(slugForArchive('!!!')).toBe('project');
  });

  it('does not produce an unusably long name', () => {
    expect(slugForArchive('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it('stamps the name so a second export does not overwrite the first', () => {
    const first = archiveName('App', new Date('2026-03-04T05:06:07.000Z'));
    const second = archiveName('App', new Date('2026-03-04T05:06:08.000Z'));

    expect(first).not.toBe(second);
    expect(first).toContain('2026-03-04');
    expect(first.endsWith('.zip')).toBe(true);
  });
});

describe('the archive', () => {
  it('contains every exportable file', async () => {
    const blob = await buildArchive(collectExportableFiles(project()));

    expect(blob.size).toBeGreaterThan(0);
  });

  it('builds an empty archive without failing', async () => {
    await expect(buildArchive([])).resolves.toBeDefined();
  });
});

describe('writing into a folder', () => {
  function fakeDirectory() {
    const written = new Map<string, string>();

    const makeHandle = (prefix: string): FileSystemDirectoryHandle =>
      ({
        getDirectoryHandle: vi.fn(async (name: string) => makeHandle(`${prefix}${name}/`)),
        getFileHandle: vi.fn(async (name: string) => ({
          createWritable: async () => ({
            write: async (content: string) => written.set(`${prefix}${name}`, content),
            close: async () => undefined,
          }),
        })),
      }) as unknown as FileSystemDirectoryHandle;

    return { handle: makeHandle(''), written };
  }

  it('writes each file at its own path', async () => {
    const { handle, written } = fakeDirectory();

    await writeProjectToDirectory(project(), handle);

    expect([...written.keys()].sort()).toEqual(['package.json', 'src/App.tsx']);
  });

  it('writes the file contents', async () => {
    const { handle, written } = fakeDirectory();

    await writeProjectToDirectory(project(), handle);

    expect(written.get('package.json')).toBe('{}');
  });

  it('reports what it wrote', async () => {
    const { handle } = fakeDirectory();

    expect(await writeProjectToDirectory(project(), handle)).toEqual(['package.json', 'src/App.tsx']);
  });

  it('writes nothing for an empty workspace', async () => {
    const { handle, written } = fakeDirectory();

    expect(await writeProjectToDirectory({}, handle)).toEqual([]);
    expect(written.size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createVirtualWorkspace, writeVirtualFile } from './files';
import {
  commitWorkspaceRevision,
  createRevisionHistory,
  diffLines,
  diffWorkspaceRevisions,
  getWorkspaceRevision,
} from './revisions';

describe('workspace revisions', () => {
  it('commits deterministic, linked revisions and ignores identical workspace references', () => {
    const firstWorkspace = createVirtualWorkspace([{ path: 'a.txt', content: 'one' }]);
    const first = commitWorkspaceRevision(createRevisionHistory(), firstWorkspace, {
      summary: 'Initial',
      createdAt: '2026-09-13T10:00:00.000Z',
    });
    const unchanged = commitWorkspaceRevision(first, firstWorkspace, {
      summary: 'No changes',
      createdAt: '2026-09-13T10:01:00.000Z',
    });
    const second = commitWorkspaceRevision(first, writeVirtualFile(firstWorkspace, { path: 'a.txt', content: 'two' }), {
      summary: 'Update',
      createdAt: '2026-09-13T10:02:00.000Z',
    });

    expect(unchanged).toBe(first);
    expect(second.revisions.map((revision) => revision.id)).toEqual(['revision-1', 'revision-2']);
    expect(second.revisions[1].parentId).toBe('revision-1');
    expect(getWorkspaceRevision(second, 'revision-2')?.summary).toBe('Update');
  });

  it('describes additions, modifications and deletions', () => {
    const beforeWorkspace = createVirtualWorkspace([
      { path: 'changed.txt', content: 'same\nold\nend' },
      { path: 'deleted.txt', content: 'gone' },
    ]);
    const afterWorkspace = createVirtualWorkspace([
      { path: 'changed.txt', content: 'same\nnew\nend' },
      { path: 'added.txt', content: 'hello' },
    ]);
    let history = commitWorkspaceRevision(createRevisionHistory(), beforeWorkspace, {
      summary: 'Before',
      createdAt: '2026-09-13T10:00:00.000Z',
    });
    history = commitWorkspaceRevision(history, afterWorkspace, {
      summary: 'After',
      createdAt: '2026-09-13T10:01:00.000Z',
    });

    const changes = diffWorkspaceRevisions(history.revisions[0], history.revisions[1]);
    expect(changes.map(({ path, kind }) => [path, kind])).toEqual([
      ['added.txt', 'added'],
      ['changed.txt', 'modified'],
      ['deleted.txt', 'deleted'],
    ]);
    expect(changes[1].lines).toEqual([
      { kind: 'equal', line: 'same' },
      { kind: 'insert', line: 'new' },
      { kind: 'delete', line: 'old' },
      { kind: 'equal', line: 'end' },
    ]);
  });

  it('normalizes CRLF before calculating line changes', () => {
    expect(diffLines('one\r\ntwo', 'one\ntwo')).toEqual([
      { kind: 'equal', line: 'one' },
      { kind: 'equal', line: 'two' },
    ]);
  });

  it('rejects invalid revision metadata', () => {
    const workspace = createVirtualWorkspace();
    expect(() =>
      commitWorkspaceRevision(createRevisionHistory(), workspace, { summary: '', createdAt: 'now' }),
    ).toThrow();
    expect(() =>
      commitWorkspaceRevision(createRevisionHistory(), workspace, {
        summary: 'Valid summary',
        createdAt: 'not-a-date',
      }),
    ).toThrow();
  });
});

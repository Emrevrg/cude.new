import type { VirtualFile, VirtualWorkspace } from './files';

export interface WorkspaceRevision {
  readonly id: string;
  readonly parentId?: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly workspace: VirtualWorkspace;
}

export interface RevisionHistory {
  readonly revisions: readonly WorkspaceRevision[];
}

export type LineChange =
  | { readonly kind: 'equal'; readonly line: string }
  | { readonly kind: 'insert'; readonly line: string }
  | { readonly kind: 'delete'; readonly line: string };

export interface FileChange {
  readonly path: string;
  readonly kind: 'added' | 'modified' | 'deleted';
  readonly before?: VirtualFile;
  readonly after?: VirtualFile;
  readonly lines: readonly LineChange[];
}

export function createRevisionHistory(): RevisionHistory {
  return Object.freeze({ revisions: Object.freeze([]) });
}

export function commitWorkspaceRevision(
  history: RevisionHistory,
  workspace: VirtualWorkspace,
  details: { readonly summary: string; readonly createdAt: string },
): RevisionHistory {
  if (!details.summary.trim()) {
    throw new Error('A workspace revision requires a summary.');
  }

  if (Number.isNaN(Date.parse(details.createdAt))) {
    throw new Error('A workspace revision requires an ISO timestamp.');
  }

  const parent = history.revisions.at(-1);

  if (parent?.workspace === workspace) {
    return history;
  }

  const revision: WorkspaceRevision = Object.freeze({
    id: `revision-${history.revisions.length + 1}`,
    ...(parent ? { parentId: parent.id } : {}),
    summary: details.summary.trim(),
    createdAt: details.createdAt,
    workspace,
  });

  return Object.freeze({ revisions: Object.freeze([...history.revisions, revision]) });
}

export function getWorkspaceRevision(history: RevisionHistory, id: string): WorkspaceRevision | undefined {
  return history.revisions.find((revision) => revision.id === id);
}

export function diffWorkspaceRevisions(before: WorkspaceRevision, after: WorkspaceRevision): readonly FileChange[] {
  const paths = [...new Set([...Object.keys(before.workspace.files), ...Object.keys(after.workspace.files)])].sort();
  const changes: FileChange[] = [];

  for (const path of paths) {
    const previous = before.workspace.files[path];
    const next = after.workspace.files[path];

    if (previous?.content === next?.content && previous?.mediaType === next?.mediaType) {
      continue;
    }

    changes.push(
      Object.freeze({
        path,
        kind: previous ? (next ? 'modified' : 'deleted') : 'added',
        ...(previous ? { before: previous } : {}),
        ...(next ? { after: next } : {}),
        lines: Object.freeze(diffLines(previous?.content ?? '', next?.content ?? '')),
      }),
    );
  }

  return Object.freeze(changes);
}

/** Minimal line diff using a longest-common-subsequence table. */
export function diffLines(before: string, after: string): readonly LineChange[] {
  const left = splitLines(before);
  const right = splitLines(after);
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  const changes: LineChange[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      changes.push({ kind: 'equal', line: left[leftIndex] });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < right.length &&
      (leftIndex === left.length || table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])
    ) {
      changes.push({ kind: 'insert', line: right[rightIndex] });
      rightIndex += 1;
    } else {
      changes.push({ kind: 'delete', line: left[leftIndex] });
      leftIndex += 1;
    }
  }

  return changes;
}

function splitLines(value: string): string[] {
  return value === '' ? [] : value.replace(/\r\n/g, '\n').split('\n');
}

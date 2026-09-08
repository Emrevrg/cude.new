/**
 * Cude.new - what changed in this file.
 *
 * Renders the diff the model computes. Everything about alignment, line
 * numbering and folding lives in `diffModel`, tested there; this decides what
 * it looks like.
 *
 * The version it replaces was eight hundred lines carrying a hand-written diff
 * algorithm, a syntax highlighter it loaded at render time, and a fullscreen
 * mode, in one file.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { extractRelativePath } from '~/utils/diff';
import { collapseUnchanged, diffText, summarize, type DiffRow } from '~/lib/cude/state/workspace/diffModel';
import type { FileMap } from '~/lib/cude/state/workspace';

const CONTEXT_LINES = 3;

function LineNumber({ value }: { value?: number }) {
  return (
    <span className="w-10 shrink-0 select-none pr-2 text-right text-[11px] tabular-nums text-cude-textTertiary">
      {value ?? ''}
    </span>
  );
}

function Row({ row, onExpand }: { row: DiffRow; onExpand: () => void }) {
  if (row.type === 'gap') {
    return (
      <button
        onClick={onExpand}
        className="flex w-full items-center gap-2 bg-cude-background-depth-2 px-2 py-1 text-left text-[11px] text-cude-textTertiary hover:text-cude-textSecondary"
      >
        <span className="w-20 shrink-0 text-right">⋯</span>
        {row.count} unchanged {row.count === 1 ? 'line' : 'lines'}
      </button>
    );
  }

  return (
    <div
      className={classNames(
        'flex items-start font-mono text-xs leading-5',
        row.type === 'added'
          ? 'bg-cude-icon-success/10'
          : row.type === 'removed'
            ? 'bg-cude-item-contentDanger/10'
            : '',
      )}
    >
      <LineNumber value={row.beforeLine} />
      <LineNumber value={row.afterLine} />

      <span
        aria-hidden="true"
        className={classNames(
          'w-4 shrink-0 select-none text-center',
          row.type === 'added'
            ? 'text-cude-icon-success'
            : row.type === 'removed'
              ? 'text-cude-item-contentDanger'
              : 'text-cude-textTertiary',
        )}
      >
        {row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ''}
      </span>

      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-cude-textPrimary">
        {row.content || ' '}
      </pre>
    </div>
  );
}

export const DiffSurface = memo(() => {
  const files = useStore(workbenchStore.files) as FileMap;
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);

  const [expanded, setExpanded] = useState(false);

  const entry = selectedFile ? files[selectedFile] : undefined;
  const current = currentDocument?.value ?? (entry && 'content' in entry ? entry.content : '');

  /*
   * The original is what the file held when this build began, taken from the
   * workspace rather than accumulated while rendering. A file the build has not
   * touched compares against itself, and the surface says so.
   */
  const changed = useStore(workbenchStore.changedByBuild);
  const original = selectedFile ? (workbenchStore.baselineFor(selectedFile) ?? current) : '';

  const diff = useMemo(() => diffText(original ?? '', current ?? ''), [original, current, changed]);

  const rows = useMemo(() => (expanded ? diff.lines : collapseUnchanged(diff.lines, CONTEXT_LINES)), [diff, expanded]);

  const expand = useCallback(() => setExpanded(true), []);

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-cude-textTertiary">Choose a file to see what changed in it during this build.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-cude-borderColor bg-cude-background-depth-2 px-3 py-2">
        <span className="truncate text-sm text-cude-textPrimary">{extractRelativePath(selectedFile)}</span>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[11px] tabular-nums text-cude-textTertiary">{summarize(diff)}</span>

          {!expanded && diff.lines.length > rows.length && (
            <button onClick={expand} className="text-[11px] text-cude-textSecondary hover:text-cude-textPrimary">
              Show the whole file
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {diff.isBinary ? (
          <p className="p-6 text-center text-sm text-cude-textTertiary">
            This file is not text, so there is nothing to compare.
          </p>
        ) : diff.unchanged ? (
          <p className="p-6 text-center text-sm text-cude-textTertiary">This file has not changed during this build.</p>
        ) : (
          rows.map((row, index) => (
            <Row key={row.type === 'gap' ? `gap-${index}` : `${row.type}-${index}`} row={row} onExpand={expand} />
          ))
        )}
      </div>
    </div>
  );
});

DiffSurface.displayName = 'DiffSurface';

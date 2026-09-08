/**
 * Cude.new - comparing two versions of a file.
 *
 * Uses the diff library the project already depends on. The implementation this
 * replaces walked the two files with a hand-written lookahead window, which
 * produces a worse alignment than a proper longest-common-subsequence and gets
 * steadily worse as a file grows — exactly when a readable diff matters most.
 *
 * Pure, so the alignment and the collapsing rules can be checked directly.
 */

import { diffLines } from 'diff';

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  content: string;

  /** Line number in the earlier version, when the line exists there. */
  beforeLine?: number;

  /** Line number in the later version, when the line exists there. */
  afterLine?: number;
}

export interface FileDiff {
  lines: DiffLine[];
  added: number;
  removed: number;

  /** True when one side could not be read as text. */
  isBinary: boolean;

  /** True when the two versions are the same. */
  unchanged: boolean;
}

/** A run of unchanged lines that has been folded away. */
export interface DiffGap {
  type: 'gap';
  count: number;
}

export type DiffRow = DiffLine | DiffGap;

export const MAX_TEXT_BYTES = 1024 * 1024;

/* Control characters no text file contains, tab, CR and LF excepted. */
const CONTROL_CHARACTERS = /[\x00-\x08\x0E-\x1F]/;

export function looksBinary(content: string): boolean {
  return content.length > MAX_TEXT_BYTES || CONTROL_CHARACTERS.test(content);
}

/**
 * Normalises line endings and drops trailing whitespace, which is not a change
 * worth showing.
 *
 * The newline that ends the last line is a terminator, not a separator: a file
 * ending in a newline has as many lines as one that does not, and counting the
 * empty string after it puts every line number one out.
 */
function toLines(content: string): string[] {
  if (content === '') {
    return [];
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((line) => line.trimEnd());

  if (lines[lines.length - 1] === '' && normalized.endsWith('\n')) {
    lines.pop();
  }

  return lines;
}

export function diffText(before: string, after: string): FileDiff {
  if (looksBinary(before) || looksBinary(after)) {
    return { lines: [], added: 0, removed: 0, isBinary: true, unchanged: before === after };
  }

  const beforeLines = toLines(before);
  const afterLines = toLines(after);

  /*
   * Each line carries its own terminator. Joining and appending one instead
   * would give an empty file a single empty line, which then shows up as an
   * added or removed line that is not in either file.
   */
  const terminate = (lines: string[]) => lines.map((line) => `${line}\n`).join('');

  if (beforeLines.join('\n') === afterLines.join('\n')) {
    return {
      lines: afterLines.map((content, index) => ({
        type: 'unchanged',
        content,
        beforeLine: index + 1,
        afterLine: index + 1,
      })),
      added: 0,
      removed: 0,
      isBinary: false,
      unchanged: true,
    };
  }

  const lines: DiffLine[] = [];
  let beforeNumber = 0;
  let afterNumber = 0;
  let added = 0;
  let removed = 0;

  for (const part of diffLines(terminate(beforeLines), terminate(afterLines))) {
    /*
     * The library ends each part with a newline, which splits into a trailing
     * empty string that is not a line of the file.
     */
    const partLines = part.value.split('\n');

    if (partLines[partLines.length - 1] === '') {
      partLines.pop();
    }

    for (const content of partLines) {
      if (part.added) {
        afterNumber += 1;
        added += 1;
        lines.push({ type: 'added', content, afterLine: afterNumber });
      } else if (part.removed) {
        beforeNumber += 1;
        removed += 1;
        lines.push({ type: 'removed', content, beforeLine: beforeNumber });
      } else {
        beforeNumber += 1;
        afterNumber += 1;
        lines.push({ type: 'unchanged', content, beforeLine: beforeNumber, afterLine: afterNumber });
      }
    }
  }

  return { lines, added, removed, isBinary: false, unchanged: false };
}

/**
 * Folds long runs of unchanged lines, keeping `context` lines either side.
 *
 * A gap is only worth folding if it removes more lines than the marker costs,
 * so runs of `context * 2 + 1` or fewer are left alone rather than replaced by
 * a "1 line hidden" row nobody wants to expand.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffRow[] {
  const rows: DiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index].type !== 'unchanged') {
      rows.push(lines[index]);
      index += 1;
      continue;
    }

    let end = index;

    while (end < lines.length && lines[end].type === 'unchanged') {
      end += 1;
    }

    const run = lines.slice(index, end);
    const atStart = index === 0;
    const atEnd = end === lines.length;

    // Leading and trailing context has only one side to keep.
    const keepBefore = atStart ? 0 : context;
    const keepAfter = atEnd ? 0 : context;

    if (run.length <= keepBefore + keepAfter + 1) {
      rows.push(...run);
    } else {
      rows.push(...run.slice(0, keepBefore));
      rows.push({ type: 'gap', count: run.length - keepBefore - keepAfter });

      if (keepAfter > 0) {
        rows.push(...run.slice(run.length - keepAfter));
      }
    }

    index = end;
  }

  return rows;
}

/** One-line summary of a diff, for a header. */
export function summarize(diff: FileDiff): string {
  if (diff.isBinary) {
    return 'Binary file';
  }

  if (diff.unchanged) {
    return 'No changes';
  }

  const parts: string[] = [];

  if (diff.added > 0) {
    parts.push(`+${diff.added}`);
  }

  if (diff.removed > 0) {
    parts.push(`−${diff.removed}`);
  }

  return parts.join(' ');
}

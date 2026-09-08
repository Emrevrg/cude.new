/**
 * Cude.new - file comparison.
 *
 * Line numbering is what these tests are really about. A diff whose numbers do
 * not line up with the file is worse than no diff at all, and it is invisible
 * until someone tries to use it to find something.
 */

import { describe, it, expect } from 'vitest';
import { diffText, collapseUnchanged, summarize, looksBinary, type DiffLine } from './diffModel';

function render(lines: DiffLine[]): string[] {
  return lines.map((line) => `${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}${line.content}`);
}

describe('identical files', () => {
  it('reports no change', () => {
    const diff = diffText('one\ntwo\n', 'one\ntwo\n');

    expect(diff).toMatchObject({ unchanged: true, added: 0, removed: 0 });
  });

  it('ignores line-ending differences', () => {
    expect(diffText('one\r\ntwo\r\n', 'one\ntwo\n').unchanged).toBe(true);
  });

  it('ignores trailing whitespace', () => {
    expect(diffText('one   \ntwo\n', 'one\ntwo\n').unchanged).toBe(true);
  });

  it('still lists the lines, so an unchanged file can be shown', () => {
    expect(diffText('one\ntwo\n', 'one\ntwo\n').lines).toHaveLength(2);
  });
});

describe('changes', () => {
  it('marks an added line', () => {
    const diff = diffText('one\n', 'one\ntwo\n');

    expect(render(diff.lines)).toEqual([' one', '+two']);
    expect(diff.added).toBe(1);
  });

  it('marks a removed line', () => {
    const diff = diffText('one\ntwo\n', 'one\n');

    expect(render(diff.lines)).toEqual([' one', '-two']);
    expect(diff.removed).toBe(1);
  });

  it('shows a replacement as a removal and an addition', () => {
    const diff = diffText('one\ntwo\nthree\n', 'one\nTWO\nthree\n');

    expect(render(diff.lines)).toEqual([' one', '-two', '+TWO', ' three']);
    expect(diff).toMatchObject({ added: 1, removed: 1 });
  });

  it('aligns a block moved past unrelated lines', () => {
    const before = 'a\nb\nc\nd\ne\n';
    const after = 'a\nc\nd\ne\n';
    const diff = diffText(before, after);

    // Only the removed line should be marked; everything else stays unchanged.
    expect(diff).toMatchObject({ added: 0, removed: 1 });
    expect(diff.lines.filter((line) => line.type === 'unchanged')).toHaveLength(4);
  });

  it('handles a file that was empty', () => {
    const diff = diffText('', 'one\ntwo\n');

    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(0);
  });

  it('handles a file that became empty', () => {
    const diff = diffText('one\ntwo\n', '');

    expect(diff.removed).toBe(2);
    expect(diff.added).toBe(0);
  });
});

describe('line numbers', () => {
  it('numbers unchanged lines in both files', () => {
    const [first] = diffText('one\ntwo\n', 'one\nTWO\n').lines;

    expect(first).toMatchObject({ beforeLine: 1, afterLine: 1 });
  });

  it('gives an added line only an after number', () => {
    const added = diffText('one\n', 'one\ntwo\n').lines.find((line) => line.type === 'added');

    expect(added).toMatchObject({ afterLine: 2 });
    expect(added?.beforeLine).toBeUndefined();
  });

  it('gives a removed line only a before number', () => {
    const removed = diffText('one\ntwo\n', 'one\n').lines.find((line) => line.type === 'removed');

    expect(removed).toMatchObject({ beforeLine: 2 });
    expect(removed?.afterLine).toBeUndefined();
  });

  it('keeps counting correctly after an insertion', () => {
    const diff = diffText('a\nb\n', 'a\nnew\nb\n');
    const last = diff.lines[diff.lines.length - 1];

    expect(last).toMatchObject({ content: 'b', beforeLine: 2, afterLine: 3 });
  });
});

describe('binary content', () => {
  it('refuses to diff a file with control characters', () => {
    expect(diffText('text', 'bin\u0000ary')).toMatchObject({ isBinary: true, lines: [] });
  });

  it('refuses to diff a file that is too large', () => {
    expect(looksBinary('x'.repeat(1024 * 1024 + 1))).toBe(true);
  });

  it('treats tabs and newlines as text', () => {
    expect(looksBinary('a\tb\r\nc')).toBe(false);
  });
});

describe('collapsing unchanged runs', () => {
  function lines(count: number, type: DiffLine['type'] = 'unchanged'): DiffLine[] {
    return Array.from({ length: count }, (_, index) => ({ type, content: `line ${index}` }));
  }

  it('leaves a short run alone', () => {
    const rows = collapseUnchanged([...lines(1, 'added'), ...lines(3), ...lines(1, 'added')], 3);

    expect(rows.some((row) => row.type === 'gap')).toBe(false);
  });

  it('folds a long run between two changes, keeping context on both sides', () => {
    const rows = collapseUnchanged([...lines(1, 'added'), ...lines(20), ...lines(1, 'added')], 3);
    const gap = rows.find((row) => row.type === 'gap');

    expect(gap).toEqual({ type: 'gap', count: 14 });
    expect(rows).toHaveLength(1 + 3 + 1 + 3 + 1);
  });

  it('keeps no leading context at the top of a file', () => {
    const rows = collapseUnchanged([...lines(20), ...lines(1, 'added')], 3);

    expect(rows[0]).toEqual({ type: 'gap', count: 17 });
  });

  it('keeps no trailing context at the end of a file', () => {
    const rows = collapseUnchanged([...lines(1, 'added'), ...lines(20)], 3);

    expect(rows[rows.length - 1]).toEqual({ type: 'gap', count: 17 });
  });

  it('folds a file with no changes at all into one gap', () => {
    expect(collapseUnchanged(lines(50), 3)).toEqual([{ type: 'gap', count: 50 }]);
  });

  it('returns nothing for nothing', () => {
    expect(collapseUnchanged([], 3)).toEqual([]);
  });
});

describe('summary', () => {
  it('counts both directions', () => {
    expect(summarize(diffText('one\ntwo\n', 'one\nTWO\nthree\n'))).toBe('+2 −1');
  });

  it('says so when nothing changed', () => {
    expect(summarize(diffText('a\n', 'a\n'))).toBe('No changes');
  });

  it('says so for a binary file', () => {
    expect(summarize(diffText('a', 'b\u0000'))).toBe('Binary file');
  });
});

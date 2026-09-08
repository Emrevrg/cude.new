/**
 * Cude.new — one file, one name.
 *
 * Two things record a generated file: the Builder, which writes it, and the
 * container's own file watcher, which reports it a moment later. They named it
 * differently — `/index.html` from one, `/home/project/index.html` from the
 * other — so a three-file app appeared in the tree as six, and the entry the
 * editor opened by default was whichever one held the partial content the
 * streaming write had left behind.
 *
 * The watcher's shape wins: it arrives unprompted and cannot be changed.
 */

import { describe, it, expect } from 'vitest';
import { resolveWorkspacePath } from './actionExecutor';
import { normalizeWorkspacePath } from '~/lib/cude/runtime/shared';
import { WORK_DIR } from '~/lib/cude/constants';

describe('the name a generated file is recorded under', () => {
  it('is the one the container reports it by', () => {
    expect(resolveWorkspacePath('index.html')).toBe(`${WORK_DIR}/index.html`);
    expect(resolveWorkspacePath('src/main.ts')).toBe(`${WORK_DIR}/src/main.ts`);
  });

  it('does not change a name that is already in that shape', () => {
    // Or the same file would nest one level deeper on every pass.
    expect(resolveWorkspacePath(`${WORK_DIR}/index.html`)).toBe(`${WORK_DIR}/index.html`);
  });

  it('gives the model and the watcher the same key for one file', () => {
    const asTheBuilderWritesIt = resolveWorkspacePath('styles.css');
    const asTheWatcherReportsIt = `${WORK_DIR}/styles.css`;

    expect(asTheBuilderWritesIt).toBe(asTheWatcherReportsIt);
  });

  it('copes with whitespace and stray slashes', () => {
    expect(resolveWorkspacePath('  index.html ')).toBe(`${WORK_DIR}/index.html`);
    expect(resolveWorkspacePath('/index.html')).toBe(`${WORK_DIR}/index.html`);
  });
});

describe('the name the container filesystem is given', () => {
  it('is relative, because that filesystem is already rooted at the workspace', () => {
    expect(normalizeWorkspacePath(`${WORK_DIR}/index.html`)).toBe('index.html');
    expect(normalizeWorkspacePath('index.html')).toBe('index.html');
  });

  it('never roots the workspace twice', () => {
    /*
     * The bug this replaces: the absolute form was rooted again, and files
     * landed at /home/project/home/project/index.html — on disk, not just in
     * the tree.
     */
    const viaBuilder = normalizeWorkspacePath(resolveWorkspacePath('index.html'));

    expect(viaBuilder).toBe('index.html');
    expect(viaBuilder).not.toContain('home/project');
  });

  it('round-trips any relative path a model might emit', () => {
    for (const candidate of ['index.html', 'src/app.ts', 'a/b/c/d.json', 'package.json']) {
      expect(normalizeWorkspacePath(resolveWorkspacePath(candidate)), candidate).toBe(candidate);
    }
  });

  it('still refuses a path that climbs out of the workspace', () => {
    // Generated projects are untrusted input.
    expect(() => normalizeWorkspacePath('../etc/passwd')).toThrow(/escapes the workspace/i);
  });
});

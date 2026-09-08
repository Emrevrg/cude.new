/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots } from './snapshots';
import { preFlight } from './preflight';

describe('file snapshots', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and lists newest first', () => {
    const first = saveSnapshot('v1', { '/a.ts': { type: 'file', content: 'one' } });
    const second = saveSnapshot('v2', { '/a.ts': { type: 'file', content: 'two' } });

    const listed = readSnapshots();
    expect(listed).toHaveLength(2);
    expect(listed[0].id).toBe(second.id);
    expect(listed[1].id).toBe(first.id);
  });

  it('deletes one without touching the other', () => {
    const a = saveSnapshot('a', { '/x': { type: 'file', content: '1' } });
    const b = saveSnapshot('b', { '/x': { type: 'file', content: '2' } });

    deleteSnapshot(a.id);

    const listed = readSnapshots();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(b.id);
  });

  it('keeps the files it was given, not later mutations', () => {
    const files = { '/a.ts': { type: 'file', content: 'one' } } as unknown as Record<string, unknown>;
    saveSnapshot('snap', files);
    (files as Record<string, unknown>)['/a.ts'] = { type: 'file', content: 'two' } as unknown;

    expect((readSnapshots()[0].files as Record<string, { content: string }>)['/a.ts'].content).toBe('one');
  });

  it('clears all', () => {
    saveSnapshot('a', { '/x': { type: 'file', content: '1' } });
    clearSnapshots();
    expect(readSnapshots()).toEqual([]);
  });

  it('tolerates corrupt storage', () => {
    window.localStorage.setItem('cude.fileSnapshots', 'not-json[');
    expect(readSnapshots()).toEqual([]);
  });
});

describe('pre-flight', () => {
  it('counts files and bytes', () => {
    const report = preFlight({
      '/a.ts': { type: 'file', isBinary: false, content: 'hello' },
      '/b.ts': { type: 'file', isBinary: false, content: 'world!' },
      '/src': { type: 'folder' },
    } as never);

    expect(report.files).toBe(2);
    expect(report.bytes).toBe(11);
  });

  it('counts UTF-8 bytes rather than JavaScript characters', () => {
    const report = preFlight({
      '/merhaba.txt': { type: 'file', isBinary: false, content: 'ışık' },
    } as never);

    expect(report.files).toBe(1);
    expect(report.bytes).toBe(7);
  });

  it('warns on a suspicious secret-looking string', () => {
    const report = preFlight({
      '/.env': { type: 'file', isBinary: false, content: 'KEY=sk-12345678901234567890abcdef' },
    } as never);

    expect(report.issues.some((issue) => issue.level === 'warning')).toBe(true);
  });

  it('notes an empty workspace', () => {
    const report = preFlight({} as never);
    expect(report.issues.some((issue) => issue.message.toLowerCase().includes('empty'))).toBe(true);
  });
});

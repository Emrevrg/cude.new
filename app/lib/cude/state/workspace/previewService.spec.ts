/**
 * Cude.new - preview session behaviour.
 *
 * A preview that has stopped must disappear rather than leaving a dead frame,
 * and reloading must not require reaching into the iframe — that is blocked by
 * the sandbox, and weakening it would trade isolation for convenience.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { PreviewService, previewIdFromUrl } from './previewService';

const ready = (port: number, url: string) => ({ port, url, kind: 'ready' as const });
const closed = (port: number, url = '') => ({ port, url, kind: 'closed' as const });

describe('previewIdFromUrl', () => {
  it('reads the identifying label from a workspace preview URL', () => {
    expect(previewIdFromUrl('https://abc123--3000.local-credentialless.example.dev')).toBe('abc123--3000');
  });

  it('returns null for a bare host with no label', () => {
    expect(previewIdFromUrl('http://localhost:3000')).toBeNull();
  });

  it('returns null for something that is not a URL', () => {
    expect(previewIdFromUrl('not a url')).toBeNull();
  });
});

describe('tracking previews', () => {
  let previews: PreviewService;

  beforeEach(() => {
    previews = new PreviewService();
  });

  it('starts empty', () => {
    expect(previews.previews.get()).toEqual([]);
  });

  it('records a preview that becomes ready', () => {
    previews.apply(ready(3000, 'https://p--3000.example.dev'));

    expect(previews.previews.get()).toEqual([
      { port: 3000, baseUrl: 'https://p--3000.example.dev', ready: true, refreshToken: 0 },
    ]);
  });

  it('keeps previews ordered by port', () => {
    previews.apply(ready(5173, 'https://p--5173.example.dev'));
    previews.apply(ready(3000, 'https://p--3000.example.dev'));

    expect(previews.previews.get().map((p) => p.port)).toEqual([3000, 5173]);
  });

  it('updates the URL of a preview that reappears on the same port', () => {
    previews.apply(ready(3000, 'https://old.example.dev'));
    previews.apply(ready(3000, 'https://new.example.dev'));

    expect(previews.previews.get()).toHaveLength(1);
    expect(previews.get(3000)?.baseUrl).toBe('https://new.example.dev');
  });

  it('does nothing when the same preview is announced twice', () => {
    previews.apply(ready(3000, 'https://p.example.dev'));

    const before = previews.previews.get();
    previews.apply(ready(3000, 'https://p.example.dev'));

    expect(previews.previews.get()).toBe(before);
  });

  it('removes a preview whose server stopped', () => {
    // Leaving it listed would show a dead frame.
    previews.apply(ready(3000, 'https://p.example.dev'));
    previews.apply(closed(3000));

    expect(previews.previews.get()).toEqual([]);
  });

  it('ignores a close for a port it never saw', () => {
    previews.apply(ready(3000, 'https://p.example.dev'));

    const before = previews.previews.get();
    previews.apply(closed(9999));

    expect(previews.previews.get()).toBe(before);
  });
});

describe('refresh', () => {
  let previews: PreviewService;

  beforeEach(() => {
    previews = new PreviewService();
    previews.apply(ready(3000, 'https://a.example.dev'));
    previews.apply(ready(4000, 'https://b.example.dev'));
  });

  it('bumps only the requested preview', () => {
    expect(previews.refresh(3000)).toBe(true);

    expect(previews.get(3000)?.refreshToken).toBe(1);
    expect(previews.get(4000)?.refreshToken).toBe(0);
  });

  it('reports a refresh for a preview that does not exist', () => {
    expect(previews.refresh(9999)).toBe(false);
  });

  it('bumps every preview on refreshAll', () => {
    previews.refreshAll();

    expect(previews.previews.get().map((p) => p.refreshToken)).toEqual([1, 1]);
  });

  it('keeps incrementing across repeated refreshes', () => {
    previews.refresh(3000);
    previews.refresh(3000);

    expect(previews.get(3000)?.refreshToken).toBe(2);
  });

  it('leaves the URL untouched, so the frame is remounted rather than navigated', () => {
    previews.refresh(3000);

    expect(previews.get(3000)?.baseUrl).toBe('https://a.example.dev');
  });
});

describe('runtime wiring and disposal', () => {
  it('picks up previews the runtime announces', async () => {
    const runtime = new MemoryRuntime();
    await runtime.initializeWorkspace();

    const previews = new PreviewService();
    previews.attachRuntime(runtime);

    runtime.emitPreviewChange(ready(3000, 'https://p.example.dev'));

    expect(previews.previews.get()).toHaveLength(1);
  });

  it('stops tracking once disposed', async () => {
    const runtime = new MemoryRuntime();
    await runtime.initializeWorkspace();

    const previews = new PreviewService();
    previews.attachRuntime(runtime);
    previews.dispose();

    runtime.emitPreviewChange(ready(3000, 'https://p.example.dev'));

    expect(previews.previews.get()).toEqual([]);
  });

  it('is safe to dispose twice', () => {
    const previews = new PreviewService();
    previews.dispose();

    expect(() => previews.dispose()).not.toThrow();
  });

  it('replaces the watcher when attached to a second runtime', async () => {
    const first = new MemoryRuntime();
    const second = new MemoryRuntime();
    await first.initializeWorkspace();
    await second.initializeWorkspace();

    const previews = new PreviewService();
    previews.attachRuntime(first);
    previews.attachRuntime(second);

    first.emitPreviewChange(ready(3000, 'https://stale.example.dev'));

    expect(previews.previews.get()).toEqual([]);

    second.emitPreviewChange(ready(4000, 'https://live.example.dev'));

    expect(previews.previews.get().map((p) => p.port)).toEqual([4000]);
  });
});

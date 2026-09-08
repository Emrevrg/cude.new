/**
 * Cude.new — the preview shows what was just written.
 *
 * `refreshAllPreviews` incremented a counter that nothing read, so the whole
 * refresh mechanism was inert — saving a file in the editor left the preview
 * on the old page, and so did a change the Builder wrote. A person asked for a
 * fifty-minute timer, Cude wrote it, the server was serving it, and the screen
 * still said 25:00 with nothing to say why.
 *
 * Two halves have to hold: the signal has to change when files change, and the
 * panel has to be watching it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PreviewService } from './previewService';

describe('the refresh signal', () => {
  it('changes for every preview when the workspace says files changed', () => {
    const previews = new PreviewService();
    previews.previews.set([
      { port: 3000, baseUrl: 'https://a.example', ready: true, refreshToken: 0 },
      { port: 5173, baseUrl: 'https://b.example', ready: true, refreshToken: 7 },
    ]);

    previews.refreshAll();

    expect(previews.previews.get().map((preview) => preview.refreshToken)).toEqual([1, 8]);
  });

  it('changes for one preview when only that port is refreshed', () => {
    const previews = new PreviewService();
    previews.previews.set([
      { port: 3000, baseUrl: 'https://a.example', ready: true, refreshToken: 0 },
      { port: 5173, baseUrl: 'https://b.example', ready: true, refreshToken: 0 },
    ]);

    previews.refresh(5173);

    expect(previews.previews.get().map((preview) => preview.refreshToken)).toEqual([0, 1]);
  });
});

describe('who is watching that signal', () => {
  /*
   * A source check, because the failure was silence: the counter moved and the
   * iframe never reloaded, and nothing anywhere reported a problem.
   */
  const surface = readFileSync(
    new URL('../../../../components/cude/workbench/PreviewSurface.tsx', import.meta.url),
    'utf8',
  );
  const workbench = readFileSync(new URL('../../../stores/workbench.ts', import.meta.url), 'utf8');

  it('the preview panel reloads when the signal changes', () => {
    expect(surface, 'refreshToken is incremented and read by nobody').toContain('refreshToken');
    expect(surface).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}reload\(\)[\s\S]{0,200}\}\s*,\s*\[[^\]]*refreshToken/,
    );
  });

  it('reloads by replacing the frame, not by re-setting its src', () => {
    /*
     * The preview is a credentialless iframe. Assigning `src` to the value it
     * already has — the usual reload trick — leaves an empty frame, so the
     * reload button appeared to break the page and every automatic refresh
     * blanked it. A new element loads cleanly.
     */
    expect(surface).not.toMatch(/iframeRef\.current\.src\s*=\s*iframeRef\.current\.src/);
    expect(surface, 'the iframe is not keyed on a reload counter').toMatch(/key=\{[\s\S]{0,60}reloadCount/);
  });

  it('a file the Builder wrote triggers it', () => {
    // Not only a file somebody saved by hand, which was the only trigger there was.
    expect(workbench).toMatch(/#refreshPreviewsSoon\(\)/);
    expect(workbench).toMatch(/refreshAllPreviews\(\)/);
  });

  it('coalesces a burst of writes into one reload', () => {
    // A project arrives as several files; reloading between them shows half a page.
    expect(workbench).toMatch(/clearTimeout\(this\.#previewRefreshTimer\)/);
  });
});

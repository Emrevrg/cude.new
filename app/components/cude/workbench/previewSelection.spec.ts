/**
 * Cude.new — which server the preview panel is showing.
 *
 * The lowest port is a reasonable opening guess: a project that starts an API
 * on 3001 and the app on 3000 should open on the app. It is a bad rule for
 * what happens next. A second server appearing later on a lower port swapped a
 * working preview for a blank one — in the middle of a change the person had
 * just asked for, so the product they were looking at vanished and the reason
 * was invisible.
 *
 * Whatever is on screen stays on screen until it goes away, or they pick
 * another.
 */

import { describe, it, expect } from 'vitest';

interface Preview {
  port: number;
  baseUrl: string;
}

/** The rule as PreviewSurface applies it, with the shown port carried across calls. */
function choose(previews: Preview[], picked: number | null, shown: { port: number | null }): Preview | undefined {
  if (previews.length === 0) {
    shown.port = null;
    return undefined;
  }

  const byUser = picked !== null ? previews.find((preview) => preview.port === picked) : undefined;
  const staying = byUser ?? previews.find((preview) => preview.port === shown.port);
  const chosen = staying ?? [...previews].sort((a, b) => a.port - b.port)[0];

  shown.port = chosen.port;

  return chosen;
}

const at = (port: number): Preview => ({ port, baseUrl: `https://${port}.example` });

describe('choosing which server to show', () => {
  it('opens on the lowest port', () => {
    const shown = { port: null as number | null };

    expect(choose([at(3001), at(3000)], null, shown)?.port).toBe(3000);
  });

  it('does not swap a running preview for one that appears later', () => {
    // The failure: a working page replaced by a blank one, mid-change.
    const shown = { port: null as number | null };

    expect(choose([at(5173)], null, shown)?.port).toBe(5173);
    expect(choose([at(3000), at(5173)], null, shown)?.port).toBe(5173);
  });

  it('moves on when the one being shown goes away', () => {
    const shown = { port: null as number | null };
    choose([at(5173)], null, shown);

    expect(choose([at(3000)], null, shown)?.port).toBe(3000);
  });

  it('honours a port the person picked, over everything else', () => {
    const shown = { port: null as number | null };
    choose([at(3000), at(5173)], null, shown);

    expect(choose([at(3000), at(5173)], 5173, shown)?.port).toBe(5173);
    expect(choose([at(3000), at(5173)], 3000, shown)?.port).toBe(3000);
  });

  it('forgets what it was showing once nothing is running', () => {
    const shown = { port: null as number | null };
    choose([at(5173)], null, shown);

    expect(choose([], null, shown)).toBeUndefined();
    expect(shown.port).toBeNull();

    // A fresh start opens on the lowest again rather than a remembered ghost.
    expect(choose([at(3000), at(5173)], null, shown)?.port).toBe(3000);
  });
});

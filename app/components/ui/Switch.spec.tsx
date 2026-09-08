/**
 * Cude.new — the switch, as a piece of monochrome design.
 *
 * A switch has one job: to say whether a thing is on. On a theme with only
 * black and white to work with that is easy to get wrong, and it was — both
 * states resolved to white in the dark theme, so an enabled provider and a
 * disabled one looked exactly the same.
 *
 * These tests read the class list rather than rendering, because the states
 * are expressed as `data-[state=checked]:` variants: what matters is that the
 * off state and the on state name different colours.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = fs.readFileSync(path.join(process.cwd(), 'app', 'components', 'ui', 'Switch.tsx'), 'utf-8');

/** The background a rule sets, off state and on state. */
function backgrounds(): { off: string[]; on: string[] } {
  /*
   * Scanned as tokens rather than by quote pairs: the comments in that file
   * contain apostrophes, which is enough to make quote matching lie.
   */
  const on = [...SOURCE.matchAll(/data-\[state=checked\]:(bg-[\w-]+)/g)].map((match) => match[1]);
  const all = [...new Set([...SOURCE.matchAll(/(bg-[\w-]+)/g)].map((match) => match[1]))];

  return { off: all.filter((token) => !on.includes(token)), on };
}

describe('telling on from off', () => {
  it('paints the two states differently', () => {
    const { off, on } = backgrounds();

    expect(off.length, 'the off state needs a background').toBeGreaterThan(0);
    expect(on.length, 'the on state needs a background').toBeGreaterThan(0);

    for (const onColour of on) {
      expect(off, `${onColour} is used for both states`).not.toContain(onColour);
    }
  });

  it('never uses the primary button background, which is white in the dark theme', () => {
    /* The exact mistake: white on white, in the theme most people run. */
    expect(SOURCE).not.toContain('bg-cude-button-primary-background');
  });

  it('takes its colours from the theme rather than naming them', () => {
    const literal = [...SOURCE.matchAll(/bg-(white|black|gray-\d+|blue-\d+|green-\d+)/g)].map((match) => match[0]);

    expect(literal).toEqual([]);
  });

  it('does not draw a focus ring in a colour the theme never uses', () => {
    expect(SOURCE).not.toMatch(/ring-(blue|green|red|purple)-\d+/);
  });

  it('moves the thumb, so the state is legible without colour at all', () => {
    expect(SOURCE).toContain('data-[state=checked]:translate-x-');
  });
});

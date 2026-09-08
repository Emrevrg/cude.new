/**
 * Cude.new — every colour in the interface comes from the theme.
 *
 * A fixed hex reads correctly against exactly one background. `text-[#666]` on
 * the settings and help buttons was legible in the light theme and nearly
 * invisible in the dark one, and it overrode the token the IconButton had
 * already set — so those two were the only controls in the app that did not
 * change with the theme.
 *
 * This is a lint the eye cannot do reliably: the colours are only wrong in one
 * theme, and a screenshot of the other one looks fine.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Every source file that can put a colour on the screen. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
      continue;
    }

    if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }

  return found;
}

/*
 * A Tailwind arbitrary colour: `text-[#666]`, `bg-[#1a1a1a]`. The tokens are
 * `--cude-*` custom properties, which are what the theme actually swaps.
 */
const HARDCODED_COLOUR = /(?:text|bg|border|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g;

describe('the interface palette', () => {
  it('never paints a colour the theme cannot change', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(UI_ROOT)) {
      const source = readFileSync(file, 'utf8');

      for (const match of source.matchAll(HARDCODED_COLOUR)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${file.split(/[\/]/).slice(-2).join('/')}:${line} ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

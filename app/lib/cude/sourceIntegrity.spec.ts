/**
 * Cude.new — no invisible characters in the source.
 *
 * `\bfaq\b` written into a regex by hand became a literal backspace byte:
 * `<0x08>faq<0x08>`. It looks right in an editor, compiles, lints, and can
 * never match anything — so three terms in the shortcut filter were dead, and
 * "Blender Manual" was offered in a picker headed "choose the program to
 * clone". The same slip in a test made a security guard that could not fail.
 *
 * This is not a thing review catches. The character is invisible.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
      continue;
    }

    if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }

  return found;
}

/*
 * Every C0 control character except the three that legitimately appear in
 * source: tab, line feed, carriage return.
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

describe('the source text', () => {
  it('contains no invisible control characters', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, index) => {
        if (INVISIBLE.test(line)) {
          const shown = line.replace(
            /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            (c) => `<0x${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}>`,
          );
          offenders.push(`${file.split(/[\/]/).slice(-2).join('/')}:${index + 1} ${shown.trim().slice(0, 80)}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('would notice the character that caused this', () => {
    /*
     * A guard nobody has seen fail is a guard nobody knows works.
     *
     * Both strings are built from character codes rather than written out.
     * Writing them out is the bug: in a JavaScript string literal the escape
     * for a word boundary and the escape for a backspace are the same two
     * characters, and which one you get depends on where the string is. This
     * check failed twice while being written, for exactly that reason, and
     * the scan above caught the second one in this very file.
     */
    const backspace = String.fromCharCode(8);
    const backslash = String.fromCharCode(92);

    const asItWasWritten = `/(faq|${backspace}manual${backspace})/i`;
    const asItWasMeant = `/(faq|${backslash}bmanual${backslash}b)/i`;

    expect(INVISIBLE.test(asItWasWritten)).toBe(true);
    expect(INVISIBLE.test(asItWasMeant)).toBe(false);
  });
});

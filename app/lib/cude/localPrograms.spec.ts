/**
 * Cude.new — reading what is installed.
 *
 * This module reads the filesystem of the machine it runs on, so the test that
 * matters most is the one that keeps it from doing that anywhere else.
 */

import { describe, expect, it } from 'vitest';
import { discoverLocalPrograms, isLocalRequest, isNoise } from './localPrograms';

function requestTo(url: string): Request {
  return new Request(url);
}

describe('who is allowed to ask', () => {
  it('answers the machine it runs on', () => {
    expect(isLocalRequest(requestTo('http://localhost:5173/api/local-programs'))).toBe(true);
    expect(isLocalRequest(requestTo('http://127.0.0.1:5173/api/local-programs'))).toBe(true);
  });

  it('answers on any local port', () => {
    expect(isLocalRequest(requestTo('http://localhost:3000/api/local-programs'))).toBe(true);
  });

  it('refuses a deployed host', () => {
    expect(isLocalRequest(requestTo('https://cude.new/api/local-programs'))).toBe(false);
    expect(isLocalRequest(requestTo('https://example.pages.dev/api/local-programs'))).toBe(false);
  });

  it('refuses a hostname that merely contains the word', () => {
    expect(isLocalRequest(requestTo('https://localhost.example.com/api/local-programs'))).toBe(false);
    expect(isLocalRequest(requestTo('https://notlocalhost/api/local-programs'))).toBe(false);
  });

  it('refuses an address that only looks like the loopback one', () => {
    expect(isLocalRequest(requestTo('http://127.0.0.1.example.com/api/local-programs'))).toBe(false);
  });
});

describe('what a refused caller gets', () => {
  it('reads nothing and says why', async () => {
    const result = await discoverLocalPrograms(requestTo('https://cude.new/api/local-programs'));

    expect(result.available).toBe(false);
    expect(result.programs).toEqual([]);
    expect(result.extensions).toEqual([]);
    expect(result.reason).toBeTruthy();
  });

  it('does not leak a path into the reason it gives', async () => {
    const result = await discoverLocalPrograms(requestTo('https://cude.new/api/local-programs'));

    expect(result.reason).not.toMatch(/[A-Z]:\\|\/home\/|\/Users\//);
  });
});

describe('what a local caller gets', () => {
  it('returns lists rather than failing, whatever is on the machine', async () => {
    const result = await discoverLocalPrograms(requestTo('http://localhost:5173/api/local-programs'));

    expect(Array.isArray(result.programs)).toBe(true);
    expect(Array.isArray(result.extensions)).toBe(true);
  });

  it('gives every program a name and a source', async () => {
    const result = await discoverLocalPrograms(requestTo('http://localhost:5173/api/local-programs'));

    for (const program of result.programs) {
      expect(program.name.length).toBeGreaterThan(0);
      expect(program.source.length).toBeGreaterThan(0);
    }
  });

  it('never offers the same program name twice', async () => {
    const result = await discoverLocalPrograms(requestTo('http://localhost:5173/api/local-programs'));
    const names = result.programs.map((program) => program.name.toLowerCase());

    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves extension names rather than showing a message key', async () => {
    const result = await discoverLocalPrograms(requestTo('http://localhost:5173/api/local-programs'));

    for (const extension of result.extensions) {
      expect(extension.name).not.toMatch(/^__MSG_/);
    }
  });

  it('says which profile each extension came from', async () => {
    const result = await discoverLocalPrograms(requestTo('http://localhost:5173/api/local-programs'));

    for (const extension of result.extensions) {
      expect(extension.profile).toContain(extension.browser);
    }
  });
});

describe('a host that cannot read itself', () => {
  it('says so rather than reporting an empty machine', async () => {
    /*
     * The Workers runtime imports node:fs happily and then fails every read.
     * Reported as "available with nothing on it", the dialog told people their
     * apps did not match, which is a different and wrong thing to say.
     */
    const result = await discoverLocalPrograms(new Request('http://localhost:5173/api/local-programs'));

    if (result.programs.length === 0 && result.extensions.length === 0) {
      expect(result.available === false || result.reason !== undefined).toBe(true);
    } else {
      expect(result.available).toBe(true);
    }
  });
});

describe('telling a program from the documentation beside it', () => {
  /*
   * An installer drops "Git Release Notes" and "LockHunter on the Web" next to
   * the thing it installed. Offering those in a picker headed "choose the
   * program to clone" is offering the wrong answer.
   */
  it('leaves out the documentation installers ship', () => {
    for (const name of [
      'Git Release Notes',
      'LockHunter on the Web',
      'Node.js Command Line',
      'VLC Getting Started',
      'Blender Manual',
      'Audacity FAQ',
      'GIMP Help',
      'Frequently Asked Questions',
    ]) {
      expect(isNoise(name), `"${name}" was offered as a program`).toBe(true);
    }
  });

  it('keeps a program whose name merely contains one of those words', () => {
    /*
     * The word boundaries are the point, and they were destroyed once: written
     * by hand into the source, `\bfaq\b` became a literal backspace character,
     * so "faq", "manual" and "help" silently matched nothing at all. Restoring
     * them without boundaries would swing the other way and hide real programs.
     */
    for (const name of ['Helper Tools', 'Manualidades', 'Faqtory', 'Helpdesk Client']) {
      expect(isNoise(name), `"${name}" was hidden`).toBe(false);
    }
  });

  it('leaves the actual programs alone', () => {
    for (const name of ['Claude', 'Visual Studio Code', 'Spotify', 'Blender', 'Discord']) {
      expect(isNoise(name), `"${name}" was hidden`).toBe(false);
    }
  });
});

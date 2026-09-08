/**
 * Cude.new — the cache rules that ship with the build.
 *
 * `public/_headers` is a plain text file that nothing type-checks, and getting
 * it wrong is invisible: the site still works, it is just slow for everyone on
 * every visit. These tests hold the two things that actually matter — hashed
 * assets are kept, and no rule contradicts another.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HEADERS = fs.readFileSync(path.join(process.cwd(), 'public', '_headers'), 'utf-8');

/** The file's blocks, as a path pattern and the headers under it. */
function parse(text: string): { pattern: string; headers: Record<string, string> }[] {
  const blocks: { pattern: string; headers: Record<string, string> }[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      blocks.push({ pattern: trimmed, headers: {} });
      continue;
    }

    const at = trimmed.indexOf(':');

    if (at > 0 && blocks.length > 0) {
      blocks[blocks.length - 1].headers[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
    }
  }

  return blocks;
}

const blocks = parse(HEADERS);

/** Cloudflare applies every matching block, so this is how a path is resolved. */
function matching(urlPath: string) {
  return blocks.filter((block) => {
    if (block.pattern.endsWith('/*')) {
      return urlPath.startsWith(block.pattern.slice(0, -1));
    }

    if (block.pattern.startsWith('/*.')) {
      return urlPath.endsWith(block.pattern.slice(2));
    }

    return block.pattern === urlPath;
  });
}

function cacheControlFor(urlPath: string): string[] {
  return matching(urlPath)
    .map((block) => block.headers['Cache-Control'])
    .filter(Boolean);
}

describe('the file itself', () => {
  it('parses into blocks', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('gives every block at least one header', () => {
    for (const block of blocks) {
      expect(Object.keys(block.headers).length, block.pattern).toBeGreaterThan(0);
    }
  });

  it('starts every pattern with a slash', () => {
    for (const block of blocks) {
      expect(block.pattern.startsWith('/'), block.pattern).toBe(true);
    }
  });
});

describe('hashed assets', () => {
  it('are kept for a year and never revalidated', () => {
    const rules = cacheControlFor('/assets/index-abc123.js');

    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('immutable');
    expect(rules[0]).toContain('max-age=31536000');
  });

  it('are covered whatever their extension', () => {
    for (const asset of ['/assets/root-x.css', '/assets/chunk-y.js', '/assets/font-z.woff2']) {
      expect(cacheControlFor(asset)[0], asset).toContain('immutable');
    }
  });
});

describe('no path gets two answers', () => {
  /*
   * The rule that caused a real bug: Cloudflare applies every matching block,
   * so a Cache-Control in the catch-all was appended to the asset rule and the
   * browser was handed "immutable, max-age=0, must-revalidate".
   */
  it.each([
    '/assets/index-abc123.js',
    '/cude-lockup.png',
    '/cude-icon.svg',
    '/favicon.ico',
    '/icons/thing.svg',
    '/api/models',
    '/',
    '/chat/some-id',
  ])('resolves %s to a single Cache-Control', (urlPath) => {
    expect(cacheControlFor(urlPath).length).toBeLessThanOrEqual(1);
  });
});

describe('what must never be cached', () => {
  it('keeps API answers out of any cache', () => {
    expect(cacheControlFor('/api/local-programs')[0]).toBe('no-store');
    expect(cacheControlFor('/api/models')[0]).toBe('no-store');
  });

  it('does not let the document be kept, since it names the hashed assets', () => {
    const rules = cacheControlFor('/');

    expect(rules.some((rule) => rule.includes('immutable'))).toBe(false);
  });
});

describe('the headers that are not about caching', () => {
  it('sends them on everything', () => {
    const catchAll = blocks.find((block) => block.pattern === '/*');

    expect(catchAll?.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(catchAll?.headers['Referrer-Policy']).toBeTruthy();
  });
});

/**
 * Cude.new — a proxy that carries a credential must not write it down.
 *
 * The git proxy forwards `authorization`, and it has to: a private repository
 * cannot be cloned without it. It also logged the whole forwarded header map
 * with `Object.fromEntries(headers.entries())`, so every clone put the
 * caller's git token into the server log in plain text — somewhere it
 * outlives the request, ships to whatever collects logs, and is read by people
 * who were never given it.
 *
 * Which headers were forwarded is the diagnosable part. What was in them is
 * not ours to record.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(new URL('../../../routes/api.git-proxy.$.ts', import.meta.url), 'utf8');

/** The code, without the prose — the comments quote what was removed. */
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const code = withoutComments(source);

describe('the git proxy', () => {
  it('still forwards the credential, or private repositories break', () => {
    expect(code).toContain("'authorization'");
  });

  it('never serialises a header map into a log', () => {
    /*
     * `Object.fromEntries(headers.entries())` is the shape that did it: it
     * turns the map into an object whose values are the header contents.
     */
    expect(code).not.toMatch(/Object\.fromEntries\(\s*\w*[Hh]eaders\.entries\(\)\s*\)/);
  });

  it('logs header names rather than header values', () => {
    expect(code).toMatch(/\[\.\.\.headers\.keys\(\)\]/);
  });

  it('does not log through the bare console, where nothing is scoped or filtered', () => {
    expect(code).not.toMatch(/console\.(log|info|debug)\(/);
  });

  it('does not log the target URL with its query string', () => {
    // Some hosts put tokens in the query.
    expect(code).not.toMatch(/logger\.\w+\([^)]*targetURL/);
  });
});

/**
 * The same mistake, anywhere else it might be.
 *
 * Nobody writes `logger.debug(token)`. They write `logger.debug(config)`, and
 * the token is inside it. The MCP service did exactly that — a server entry
 * carries an optional `headers` record, which is where the `Authorization`
 * for a remote server goes.
 */
const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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

/** A whole configuration handed to a log line, and the headers-to-object shape. */
const LEAKY_SHAPES = [
  /logger\.\w+\([^)]*JSON\.stringify\(\s*(config|settings|options|env|apiKeys|providerSettings|credentials)/,
  /Object\.fromEntries\(\s*\w*[Hh]eaders\.entries\(\)\s*\)/,
];

describe('logging anywhere in the app', () => {
  it('never serialises a header map or a whole config into a log line', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      const body = withoutComments(readFileSync(file, 'utf8'));

      for (const shape of LEAKY_SHAPES) {
        const match = body.match(shape);

        if (match) {
          offenders.push(`${file.split(/[\/]/).slice(-2).join('/')}: ${match[0].slice(0, 70)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('would notice the leak it was written for', () => {
    /*
     * A guard nobody has seen fail is a guard nobody knows works. This one
     * silently did not: an escape written into the pattern by hand became a
     * literal control character, so it could never match anything.
     */
    const asItWas =
      "  async updateConfig(config: MCPConfig) {\n    logger.debug('updating config', JSON.stringify(config));";

    expect(LEAKY_SHAPES.some((shape) => shape.test(asItWas))).toBe(true);
  });
});

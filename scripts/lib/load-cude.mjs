/**
 * Shared loader for the Cude TypeScript modules.
 *
 * Verification scripts are plain Node ESM but need to exercise the *real*
 * product source rather than a copy of it. This bundles the requested modules
 * with esbuild and returns the live exports, so a verifier can never drift away
 * from what the application actually ships.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(HERE, '..', '..');

/** Temporary build directories created during this process, for cleanup. */
const tempDirs = new Set();

/**
 * Bundles the given repo-relative TypeScript modules and returns their combined
 * exports.
 *
 * @param {string[]} modulePaths Repo-relative paths, e.g. 'app/lib/cude/templates.ts'
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadCudeModules(modulePaths) {
  /*
   * Built inside the repository rather than the system temp directory. The
   * bundle keeps third-party packages external, and Node resolves those
   * relative to the file that imports them — from outside the repo there is no
   * node_modules to find.
   */
  const buildRoot = path.join(REPO_ROOT, 'node_modules', '.cude-verify');
  fs.mkdirSync(buildRoot, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(buildRoot, 'load-'));
  tempDirs.add(tmpDir);

  const entry = path.join(tmpDir, 'entry.ts');
  fs.writeFileSync(
    entry,
    modulePaths.map((m) => `export * from ${JSON.stringify(path.join(REPO_ROOT, m))};`).join('\n'),
    'utf8',
  );

  const outfile = path.join(tmpDir, 'bundle.mjs');

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',

    /*
     * The bundle runs in Node, so resolve for Node. On the neutral platform a
     * product module that pulls in a package with a Node built-in dependency
     * fails to bundle, which reads as a broken module rather than a wrong
     * target.
     */
    platform: 'node',
    target: 'node20',

    /*
     * Third-party packages stay external and are imported at run time; the
     * product's own code is bundled, so `~/...` has to resolve here rather than
     * being treated as a package.
     */
    external: ['jszip', 'file-saver', 'nanostores', '@nanostores/react', 'react', 'react-dom', 'diff', 'date-fns'],
    alias: { '~': path.join(REPO_ROOT, 'app') },

    /*
     * Vite supplies `import.meta.env` in the app; Node does not. Defining it
     * here lets a product module that reads a build flag load unchanged, rather
     * than forcing the module to know it might be running outside Vite.
     */
    define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'verification' }) },
    logLevel: 'silent',
  });

  return import(pathToFileURL(outfile).href);
}

/** Removes every temporary build directory this process created. */
export function cleanupCudeModules() {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort; a leftover temp directory is not a verification failure.
    }
  }

  tempDirs.clear();
}

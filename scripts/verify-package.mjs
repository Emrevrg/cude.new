#!/usr/bin/env node
/**
 * Cude.new - is the desktop package actually complete?
 *
 * The last one was not, and it started anyway. Fifteen transitive dependencies
 * were missing from the copied tree - `is-callable`, `hash.js`, `brorand` and
 * the rest - because electron-builder walks the dependency tree from the top
 * level, and pnpm's default layout keeps most packages in `.pnpm` and links
 * only direct dependencies at the root.
 *
 * What that looked like: the app launched, three processes appeared, the window
 * opened. Then `loadServerBuild` threw on the first missing module, the Remix
 * build stayed undefined, and every request died on "Cannot read properties of
 * undefined (reading 'routes')". A packaged app that opens and serves nothing
 * is worse than one that fails to build, because only the build failure is
 * obvious.
 *
 * So the tree is checked before anybody is asked to run it.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const APP = process.argv[2] ?? 'dist/win-unpacked/resources/app';
const MODULES = join(APP, 'node_modules');

if (!existsSync(MODULES)) {
  console.error(`No packaged tree at ${MODULES}. Build first: pnpm electron:build:unpack`);
  process.exit(1);
}

const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

/** Every package present in the packaged tree, scoped names included. */
function collect(dir, prefix = '', found = new Set()) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) {
      continue;
    }

    const path = join(dir, entry);

    if (!statSync(path).isDirectory()) {
      continue;
    }

    if (entry.startsWith('@')) {
      collect(path, `${entry}/`, found);
      continue;
    }

    found.add(prefix + entry);
  }

  return found;
}

const present = collect(MODULES);

/*
 * A dependency counts as resolvable if it sits at the top of the packaged tree
 * or nested beside the package that needs it - the two places Node looks.
 */
const unresolvable = new Map();

for (const name of present) {
  const manifest = join(MODULES, name, 'package.json');

  if (!existsSync(manifest)) {
    continue;
  }

  let pkg;

  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    continue;
  }

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (present.has(dep) || existsSync(join(MODULES, name, 'node_modules', dep))) {
      continue;
    }

    if (!unresolvable.has(dep)) {
      unresolvable.set(dep, []);
    }

    unresolvable.get(dep).push(name);
  }
}

check(
  'every dependency in the packaged tree can be resolved',
  unresolvable.size === 0,
  unresolvable.size === 0
    ? `${present.size} modules`
    : [...unresolvable].map(([dep, needers]) => `${dep} (needed by ${needers[0]})`).join(', '),
);

/* The four bundles the app cannot start without. */
const required = [
  /*
   * The client bundle, not an index.html: this is server-rendered, so there is
   * no static entry page to look for. What has to be there is the assets the
   * rendered page then asks for.
   */
  ['the renderer bundle', join(APP, 'build/client/assets')],
  ['the server build', join(APP, 'build/server/index.js')],
  ['the main process', join(APP, 'build/electron/main/index.mjs')],
  ['the preload bridge', join(APP, 'build/electron/preload/index.cjs')],
];

for (const [what, path] of required) {
  check(`${what} is in the package`, existsSync(path), path.replace(APP, '.'));
}

/*
 * The entry point `extraMetadata.main` names has to be the one that shipped.
 * A mismatch is invisible until launch, and then the window is simply blank.
 */
const packaged = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
check(
  'the manifest points at the main process that shipped',
  Boolean(packaged.main) && existsSync(join(APP, packaged.main)),
  packaged.main ?? '(no main)',
);

// Import and serve a real request: file presence alone cannot catch an
// incompatible React server entry or a missing transitive dependency.
if (results.every(Boolean)) {
  try {
    const server = await import(pathToFileURL(resolve(APP, 'build/server/index.js')).href);
    const packagedRequire = createRequire(resolve(APP, 'package.json'));
    const { createRequestHandler } = packagedRequire('@remix-run/node');
    const response = await createRequestHandler(server, 'production')(
      new Request('http://localhost:5173/'), { cloudflare: {} },
    );
    const html = await response.text();
    check('the packaged server renders the home page', response.status === 200 && html.includes('<html'), `HTTP ${response.status}`);
  } catch (error) {
    check('the packaged server renders the home page', false, String(error));
  }
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);

if (passed !== results.length) {
  console.log('\nThe package would launch and serve nothing. Not shippable.');
}

process.exit(passed === results.length ? 0 : 1);

#!/usr/bin/env node
/**
 * Cude native production-boundary gate.
 *
 * This gate answers one deliberately narrow question: can any production route
 * or application entry point reach a retired implementation area through its
 * local import graph? It does not use a baseline or allowlist. A reachable
 * legacy module is a failure until the dependency is actually removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const ROUTE_EXTENSIONS = new Set(SOURCE_EXTENSIONS.slice(0, 6));

export const FORBIDDEN_PRODUCTION_ROOTS = Object.freeze([
  'app/components/chat',
  'app/components/workbench',
  'app/components/editor',
  'app/lib/stores',
  'app/lib/webcontainer',
]);

const FIXED_ENTRY_CANDIDATES = [
  'app/root.tsx',
  'app/entry.client.tsx',
  'app/entry.server.tsx',
  'app/root.ts',
  'app/entry.client.ts',
  'app/entry.server.ts',
];

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function normalizeRelative(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walkSourceFiles(directory, output = []) {
  if (!fs.existsSync(directory)) {
    return output;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walkSourceFiles(absolute, output);
    } else if (ROUTE_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(absolute);
    }
  }

  return output;
}

function productionEntries(projectRoot) {
  const fixed = FIXED_ENTRY_CANDIDATES.map((entry) => path.join(projectRoot, entry)).filter((entry) =>
    fs.existsSync(entry),
  );
  const routes = walkSourceFiles(path.join(projectRoot, 'app', 'routes'));
  return [...new Set([...fixed, ...routes])].sort();
}

export function extractLocalSpecifiers(source) {
  const specifiers = new Set();

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1].split(/[?#]/, 1)[0];

      if (specifier.startsWith('.') || specifier.startsWith('~/')) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

function resolveLocalImport(projectRoot, importer, specifier) {
  const appRoot = path.join(projectRoot, 'app');
  const raw = specifier.startsWith('~/')
    ? path.join(appRoot, specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);

  if (!isInside(projectRoot, raw)) {
    return null;
  }

  const candidates = SOURCE_EXTENSIONS.includes(path.extname(raw))
    ? [raw]
    : [
        raw,
        ...SOURCE_EXTENSIONS.map((extension) => `${raw}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => path.join(raw, `index${extension}`)),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function matchingForbiddenRoot(projectRoot, absoluteFile, forbiddenRoots) {
  const relative = normalizeRelative(path.relative(projectRoot, absoluteFile));
  return forbiddenRoots.find((root) => relative === root || relative.startsWith(`${root}/`)) ?? null;
}

function buildChain(file, parents, projectRoot) {
  const chain = [];
  let current = file;

  while (current) {
    chain.push(normalizeRelative(path.relative(projectRoot, current)));
    current = parents.get(current) ?? null;
  }

  return chain.reverse();
}

export function analyzeNativeBoundary({ projectRoot, forbiddenRoots = FORBIDDEN_PRODUCTION_ROOTS } = {}) {
  const root = path.resolve(projectRoot ?? process.cwd());
  const entries = productionEntries(root);
  const queue = [...entries];
  const visited = new Set();
  const parents = new Map(entries.map((entry) => [entry, null]));
  const findings = [];
  const unreadable = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    const forbiddenRoot = matchingForbiddenRoot(root, current, forbiddenRoots);

    if (forbiddenRoot) {
      findings.push({
        forbiddenRoot,
        file: normalizeRelative(path.relative(root, current)),
        chain: buildChain(current, parents, root),
      });
      continue;
    }

    let source;

    try {
      source = fs.readFileSync(current, 'utf8');
    } catch (error) {
      unreadable.push({ file: normalizeRelative(path.relative(root, current)), reason: error.message });
      continue;
    }

    for (const specifier of extractLocalSpecifiers(source)) {
      const dependency = resolveLocalImport(root, current, specifier);

      if (dependency && !parents.has(dependency)) {
        parents.set(dependency, current);
        queue.push(dependency);
      }
    }
  }

  findings.sort((left, right) => left.file.localeCompare(right.file));

  return {
    projectRoot: root,
    entries: entries.map((entry) => normalizeRelative(path.relative(root, entry))),
    visitedFiles: visited.size,
    findings,
    unreadable,
    passed: findings.length === 0 && unreadable.length === 0,
  };
}

export function formatBoundaryReport(result) {
  const lines = [
    'CUDE NATIVE PRODUCTION BOUNDARY',
    `Entry modules: ${result.entries.length}`,
    `Reachable local modules: ${result.visitedFiles}`,
    `Forbidden dependencies: ${result.findings.length}`,
    `Unreadable modules: ${result.unreadable.length}`,
  ];

  for (const finding of result.findings) {
    lines.push(
      '',
      `[legacy-root] ${finding.file}`,
      `  forbidden root: ${finding.forbiddenRoot}`,
      `  import chain: ${finding.chain.join(' -> ')}`,
    );
  }

  for (const failure of result.unreadable) {
    lines.push('', `[unreadable] ${failure.file}`, `  ${failure.reason}`);
  }

  lines.push('', result.passed ? 'CUDE NATIVE BOUNDARY PASSED' : 'CUDE NATIVE BOUNDARY FAILED');

  if (!result.passed) {
    lines.push('No baseline or allowlist is accepted: remove every reachable legacy dependency.');
  }

  return lines.join('\n');
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const rootFlagIndex = process.argv.indexOf('--root');
  const projectRoot = rootFlagIndex >= 0 ? process.argv[rootFlagIndex + 1] : process.cwd();

  if (rootFlagIndex >= 0 && !projectRoot) {
    console.error('Usage: node scripts/cude-native-boundary.mjs [--root <project-directory>]');
    process.exit(2);
  }

  const result = analyzeNativeBoundary({ projectRoot });
  const output = formatBoundaryReport(result);
  (result.passed ? console.log : console.error)(output);
  process.exit(result.passed ? 0 : 1);
}

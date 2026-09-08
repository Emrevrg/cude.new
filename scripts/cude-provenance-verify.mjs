#!/usr/bin/env node
/**
 * Cude.new - provenance regression check.
 *
 * This does NOT prove independence. It cannot: independence is a property of
 * how code was written, and no script can observe that. What it does is detect
 * the reintroduction of upstream PRODUCT artifacts that were deliberately
 * removed — stale branding in user-facing surfaces, upstream update/release
 * endpoints, upstream container images, and upstream product assets.
 *
 * Legally required notices are allowlisted on purpose: a third-party notice
 * file must be able to name the project it credits without failing this check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files whose whole purpose is to record third-party provenance. Failing them
 * for naming the upstream project would be exactly backwards.
 */
const NOTICE_ALLOWLIST = new Set([
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  path.join('app', 'lib', 'palette-guard.spec.ts'),
  path.join('scripts', 'cude-provenance-verify.mjs'),
]);

/** WebContainer is a real dependency of this product, not leftover branding. */
const DEPENDENCY_PATTERNS = [/webcontainer-core/i, /WebContainer runtime/i, /@webcontainer\//i, /webcontainer-api/i];

const SCAN_DIRS = ['app', 'scripts', 'docs', '.github', 'electron', 'public'];
const SCAN_ROOT_FILES = [
  'package.json',
  'README.md',
  'FAQ.md',
  'PROJECT.md',
  'SECURITY.md',
  'changelog.md',
  'CHANGES.md',
  'docker-compose.yaml',
  'Dockerfile',
  'electron-update.yml',
  'vite.config.ts',
  'uno.config.ts',
  '.env.example',
];
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.sh',
  '.scss',
  '.css',
  '.html',
  '.ps1',
  '',
]);

/** Upstream product identifiers that must not reappear in shipped surfaces. */
const RULES = [
  {
    id: 'upstream-product-name',
    pattern: new RegExp(
      String.fromCharCode(98, 111, 108, 116) +
        '\\.diy|' +
        String.fromCharCode(98, 111, 108, 116) +
        '-diy|' +
        String.fromCharCode(98, 111, 108, 116) +
        'diy',
      'i',
    ),
    why: 'upstream product name',
  },
  { id: 'upstream-vendor', pattern: /stackblitz/i, why: 'upstream vendor name' },
  {
    id: 'upstream-sibling-product',
    pattern: new RegExp(String.fromCharCode(98, 111, 108, 116) + '\\.new', 'i'),
    why: 'upstream sibling product',
  },
  { id: 'upstream-repo', pattern: /stackblitz-labs\//i, why: 'upstream repository path' },
  { id: 'upstream-container-image', pattern: /ghcr\.io\/stackblitz-labs/i, why: 'upstream container image' },
  {
    id: 'upstream-support-domain',
    pattern: new RegExp('support\\.' + String.fromCharCode(98, 111, 108, 116) + '\\.new', 'i'),
    why: 'upstream support site',
  },
  { id: 'upstream-community', pattern: /thinktank\.ottomator\.ai/i, why: 'upstream community forum' },
];

const findings = [];

function walk(rel, out = []) {
  const abs = path.join(ROOT, rel);

  if (!fs.existsSync(abs)) {
    return out;
  }

  if (fs.statSync(abs).isFile()) {
    out.push(rel);
    return out;
  }

  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
      continue;
    }

    const next = path.join(rel, entry.name);

    if (entry.isDirectory()) {
      walk(next, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(next);
    }
  }

  return out;
}

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(d)),
  ...SCAN_ROOT_FILES.filter((f) => fs.existsSync(path.join(ROOT, f))),
];

for (const file of files) {
  if (NOTICE_ALLOWLIST.has(file)) {
    continue;
  }

  let content;

  try {
    content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  } catch {
    continue; // binary or unreadable
  }

  content.split('\n').forEach((line, i) => {
    if (DEPENDENCY_PATTERNS.some((p) => p.test(line))) {
      return;
    }

    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.id, why: rule.why, text: line.trim().slice(0, 90) });
      }
    }
  });
}

/** Upstream product assets that were removed and must not come back. */
const FORBIDDEN_ASSETS = [
  'public/favicon.svg',
  'public/logo.svg',
  'public/logo-dark.png',
  'public/logo-light.png',
  'public/logo-dark-styled.png',
  'public/logo-light-styled.png',
  'public/social_preview_index.jpg',
  'public/apple-touch-icon-precomposed.png',
  'app/routes/webcontainer.connect.$id.tsx',
];

for (const asset of FORBIDDEN_ASSETS) {
  if (fs.existsSync(path.join(ROOT, asset))) {
    findings.push({
      file: asset,
      line: 0,
      rule: 'removed-upstream-artifact',
      why: 'previously removed upstream artifact is back',
      text: '',
    });
  }
}

console.log(`Scanned ${files.length} files across ${SCAN_DIRS.length} directories.`);
console.log(`Allowlisted notice files: ${NOTICE_ALLOWLIST.size}`);

if (findings.length === 0) {
  console.log('\nChecks run: ' + (RULES.length + 1));
  console.log('Failures:   0');
  console.log('\nPROVENANCE VERIFICATION PASSED');
  console.log('\nNote: this checks for reintroduced upstream product artifacts only.');
  console.log('It does not, and cannot, establish that the implementation is independent.');
  process.exit(0);
}

console.error(`\n${findings.length} finding(s):\n`);

for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.why}`);

  if (f.text) {
    console.error(`      ${f.text}`);
  }
}

console.error('\nPROVENANCE VERIFICATION FAILED');
process.exit(1);

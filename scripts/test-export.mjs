#!/usr/bin/env node
/**
 * Cude.new - project export verification.
 *
 * Packages the generated showcase through the application's own export path, so
 * what is checked is the archive a user would actually get. This script used to
 * walk the directory and build its own zip, which verified the script rather
 * than the product.
 *
 * The fixture is read from disk into the shape the workspace holds files in,
 * then handed to `collectExportableFiles` and `buildArchive`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { loadCudeModules, REPO_ROOT } from './lib/load-cude.mjs';

const SOURCE = path.join(REPO_ROOT, 'verification-showcase');
const OUTPUT = path.join(os.tmpdir(), 'cude-export-test.zip');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const { collectExportableFiles, buildArchive, archiveName, WORK_DIR } = await loadCudeModules([
  'app/lib/cude/state/workspaceExport.ts',
  'app/lib/cude/constants.ts',
]);

/** Reads the fixture into the shape the workspace holds. */
function readWorkspace(dir, prefix = WORK_DIR) {
  const files = {};

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }

    const absolute = path.join(dir, entry.name);
    const workspacePath = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      files[workspacePath] = { type: 'folder' };
      Object.assign(files, readWorkspace(absolute, workspacePath));
    } else {
      files[workspacePath] = { type: 'file', content: fs.readFileSync(absolute, 'utf8'), isBinary: false };
    }
  }

  return files;
}

if (!fs.existsSync(SOURCE)) {
  console.error('verification-showcase/ is missing. Run: node scripts/generate-verification.mjs');
  process.exit(1);
}

const workspace = readWorkspace(SOURCE);
const exportable = collectExportableFiles(workspace);

console.log(`Workspace: ${Object.keys(workspace).length} entries, ${exportable.length} exportable\n`);

const blob = await buildArchive(exportable);
const buffer = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync(OUTPUT, buffer);

const archive = await JSZip.loadAsync(buffer);
const names = Object.keys(archive.files);

check('the archive is produced', buffer.length > 0, `${(buffer.length / 1024).toFixed(1)} kB`);
check('it carries the design system', names.includes('design-system.json'));
check('it carries the source', names.includes('src/App.tsx'));
check('it carries the shared primitives', names.includes('src/components/ui.tsx'));
check('no environment file is included', !names.some((name) => name.includes('.env')));
check('no dependencies are included', !names.some((name) => name.includes('node_modules')));
check('no build output is included', !names.some((name) => name.startsWith('dist/')));
check('paths are relative to the project root', !names.some((name) => name.startsWith('/')));

const named = archiveName('Finwise personal finance');
check('the archive is named after the project', named.startsWith('finwise-personal-finance-'), named);

console.log(`\nArchive: ${OUTPUT}`);

const failed = results.filter((result) => !result.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
console.log(`\n${failed.length === 0 ? 'EXPORT VERIFIED' : 'EXPORT VERIFICATION FAILED'}`);

process.exit(failed.length === 0 ? 0 : 1);

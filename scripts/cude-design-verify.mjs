#!/usr/bin/env node
/**
 * Cude.new - design intelligence verification.
 *
 * Generates the four-screen verification product, builds it, runs the visual QA
 * pass over it, applies a global design change, adds a screen, injects a token
 * drift and repairs it systemically.
 *
 * Every piece of that comes from the application: the design system, the visual
 * QA pass and the project generator are imported, not reimplemented. This
 * harness used to carry simplified copies of all three, which meant it reported
 * on its own behaviour rather than on what ships — a verifier that cannot fail
 * for the reason the product would.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadCudeModules } from './lib/load-cude.mjs';

const SCREENS = ['Dashboard', 'Transactions', 'Analytics', 'Settings'];

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function run(cmd, args, cwd, timeout = 180000) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout, shell: true });

  return { status: result.status, out: (result.stdout || '') + (result.stderr || '') };
}

function writeFiles(dir, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents, 'utf-8');
  }
}

const { createDesignSystem, designSystemToCssVars, applyGlobalCompactSharp, runVisualQA, financeVerificationFiles } =
  await loadCudeModules([
    'app/lib/cude/designSystem.ts',
    'app/lib/cude/visualQA.ts',
    'app/lib/cude/verificationProject.ts',
  ]);

console.log('=== Cude design intelligence verify ===\n');

const prompt = `Build a polished personal finance application with:
1. Dashboard
2. Transactions
3. Analytics
4. Settings
The product should feel precise, premium and trustworthy.
It should be responsive and use one coherent visual language across every screen.`;

const ds = createDesignSystem(prompt);
console.log(`Design Director: ${ds.meta.preset} · ${ds.identity.personality.join(', ')} · ${ds.identity.density}`);
console.log(
  `Tokens: bg=${ds.colors.background} accent=${ds.colors.accent} radius-md=${ds.radius.md} button-h=${ds.components.button.height}\n`,
);

// --- generate ------------------------------------------------------------

console.log('--- The product the pipeline generates ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cude-fin-'));
const files = financeVerificationFiles(prompt, ds);
writeFiles(dir, files);

console.log(`  ${Object.keys(files).length} files in ${dir}`);

check('design system is written alongside the code', fs.existsSync(path.join(dir, 'design-system.json')));
check(
  'tokens.css carries the design tokens',
  fs.readFileSync(path.join(dir, 'src/tokens.css'), 'utf8').includes('--color-background'),
);
check('shared primitives exist', fs.existsSync(path.join(dir, 'src/components/ui.tsx')));
check(
  'every screen consumes tokens rather than literals',
  SCREENS.every((screen) => fs.readFileSync(path.join(dir, `src/screens/${screen}.tsx`), 'utf8').includes('var(--')),
);
check('design memory is recorded', fs.existsSync(path.join(dir, 'cude-memory.json')));

// --- build ---------------------------------------------------------------

console.log('\n--- It builds ---');

const install = run('npm', ['install', '--silent'], dir);
check('dependencies install', install.status === 0, `exit ${install.status}`);

const built = run('npx', ['vite', 'build'], dir);
check('vite build', built.status === 0, `exit ${built.status}`);

const typechecked = run('npx', ['tsc', '--noEmit', '--skipLibCheck'], dir);
check('typecheck', typechecked.status === 0, `exit ${typechecked.status}`);

const report = runVisualQA(files, ds, SCREENS);
check('visual QA passes', report.passed, `${report.issues.length} issues`);

// --- a global design change ----------------------------------------------

console.log('\n--- A global design change: compact and sharper ---');

const ds2 = applyGlobalCompactSharp(ds);
console.log(
  `  v${ds.meta.version} -> v${ds2.meta.version}, radius ${ds.radius.md} -> ${ds2.radius.md}, button ${ds.components.button.height} -> ${ds2.components.button.height}`,
);

const css2 = designSystemToCssVars(ds2);
fs.writeFileSync(path.join(dir, 'design-system.json'), JSON.stringify(ds2, null, 2));
fs.writeFileSync(path.join(dir, 'src/tokens.css'), css2);

check('the change reaches the tokens', css2.includes(`--radius-md:${ds2.radius.md}`));

const rebuilt = run('npx', ['vite', 'build'], dir);
check('it still builds', rebuilt.status === 0, `exit ${rebuilt.status}`);

const afterChange = runVisualQA({ ...files, 'src/tokens.css': css2 }, ds2, SCREENS);
check('visual QA still passes', afterChange.passed, `${afterChange.issues.length} issues`);

// --- a new screen reuses the system --------------------------------------

console.log('\n--- A new screen reuses the system ---');

const recurring = `import { Card, Button } from '../components/ui';

export function Recurring() {
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <Card>Recurring <Button>Schedule</Button></Card>
    </div>
  );
}
`;
fs.writeFileSync(path.join(dir, 'src/screens/Recurring.tsx'), recurring);

check('the new screen uses tokens', recurring.includes('var(--'));
check(
  'the original design memory is preserved',
  JSON.parse(fs.readFileSync(path.join(dir, 'cude-memory.json'), 'utf8')).designSystem.meta.version === ds.meta.version,
);

// --- drift is detected and repaired systemically --------------------------

console.log('\n--- A hardcoded value drifts, and is repaired at the token ---');

const drifted = `import { Card } from '../components/ui';

export function Settings() {
  return (
    <div style={{ borderRadius: '17px', padding: 'var(--space-4)' }}>
      <Card>Bad</Card>
    </div>
  );
}
`;
fs.writeFileSync(path.join(dir, 'src/screens/Settings.tsx'), drifted);

const driftedFiles = { ...files, 'src/screens/Settings.tsx': drifted };
const driftReport = runVisualQA(driftedFiles, ds2, SCREENS);

check(
  'visual QA detects the drift',
  driftReport.issues.length > 0,
  driftReport.issues.map((issue) => issue.message).join('; '),
);

const repaired = `import { Card } from '../components/ui';

export function Settings() {
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <Card>Fixed at the token</Card>
    </div>
  );
}
`;
fs.writeFileSync(path.join(dir, 'src/screens/Settings.tsx'), repaired);

const repairedReport = runVisualQA({ ...driftedFiles, 'src/screens/Settings.tsx': repaired }, ds2, SCREENS);
check('the repair clears it', repairedReport.passed, `${repairedReport.issues.length} issues`);

// --- verdict --------------------------------------------------------------

const failed = results.filter((result) => !result.pass);

console.log(`\nChecks:     ${results.length}`);
console.log(`Failures:   ${failed.length}`);
console.log(`Project:    ${dir}`);
console.log(`\n${failed.length === 0 ? 'DESIGN VERIFICATION PASSED' : 'DESIGN VERIFICATION FAILED'}`);

process.exit(failed.length === 0 ? 0 : 1);

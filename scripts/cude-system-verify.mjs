#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCudeModules, cleanupCudeModules } from './lib/load-cude.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
let checks = 0,
  fails = 0;

function check(desc, cond, detail) {
  checks++;

  if (cond) {
    console.log(`  PASS  ${desc}`);
  } else {
    fails++;
    console.log(`  FAIL  ${desc}${detail ? ' (' + detail + ')' : ''}`);
  }
}
console.log('=== Cude.new System Verification ===');
console.log('Executing real system pipeline (internet cafe multi-component)');

let api;

try {
  api = await loadCudeModules([
    'app/lib/cude/architecture.ts',
    'app/lib/cude/productGraph.ts',
    'app/lib/cude/platformAdaptation.ts',
    'app/lib/cude/designContract.ts',
    'app/lib/cude/stackIntelligence.ts',
  ]);
} catch (e) {
  console.error('FATAL build', e.message);
  process.exit(1);
}

const { planProductArchitecture, validateProductGraph, hasRelationship } = api;
const SYSTEM_PROMPT =
  'Build an internet cafe management system for web dashboard and Windows desktop. Users sign in with the same account. Member check-in, computer allocation and billing must synchronize. It should work offline and sync when connection returns.';
const arch = planProductArchitecture(SYSTEM_PROMPT);
check('System detects web', arch.requirements.targetPlatforms.includes('web'));
check('System detects desktop', arch.requirements.targetPlatforms.includes('desktop'));
check('Stack decisions present web', !!arch.stackDecisions.web);
check('Stack decisions present desktop', !!arch.stackDecisions.desktop);
check('Product graph has >=5 nodes', arch.productGraph.nodes.length >= 5, String(arch.productGraph.nodes.length));
check(
  'Product graph has relationships',
  arch.productGraph.relationships.length >= 4,
  String(arch.productGraph.relationships.length),
);

const v = validateProductGraph(arch.productGraph);
check('Product graph validates', v.valid, v.issues?.join('; '));

const webAD = arch.platformAdapters.web,
  deskAD = arch.platformAdapters.desktop;
check('Web adapter exists', !!webAD);
check('Desktop adapter exists', !!deskAD);

if (webAD && deskAD) {
  check('Shared design identity', webAD.designSystem.meta.preset === deskAD.designSystem.meta.preset);
}

check('Design system attached', !!arch.designSystem);
cleanupCudeModules();
console.log(`\nChecks run: ${checks}\nFailures:   ${fails}\n`);

if (fails > 0) {
  console.log('SYSTEM VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('SYSTEM VERIFICATION PASSED');
}

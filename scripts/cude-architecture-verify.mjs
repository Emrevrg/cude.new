#!/usr/bin/env node
/**
 * Cude.new - Architecture Verification
 *
 * This harness EXECUTES the real architecture pipeline. It does not check that
 * files exist or that source contains certain strings — a previous version did
 * exactly that, and passed while the modules underneath did not compile.
 *
 * Everything below runs `planProductArchitecture` and friends for real and
 * asserts on the objects they return.
 *
 * Exits 0 only when every check passes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupCudeModules, loadCudeModules } from './lib/load-cude.mjs';

/** The architecture modules this harness executes, in the app's own source. */
const ARCHITECTURE_MODULES = [
  'app/lib/cude/architecture.ts',
  'app/lib/cude/engineeringRequirements.ts',
  'app/lib/cude/stackIntelligence.ts',
  'app/lib/cude/productGraph.ts',
  'app/lib/cude/projectManifest.ts',
  'app/lib/cude/addTargetWorkflow.ts',
  'app/lib/cude/platformAdaptation.ts',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FIXTURE_DIR = path.join(ROOT, 'verification-product-family');

/*
 * ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------
 */

const failures = [];
const warnings = [];
let checks = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n--- ${name} ---`);
}

function check(description, condition, detail) {
  checks++;

  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` (${detail})` : ''}`);
    failures.push(`[${currentSection}] ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

function info(line) {
  console.log(`        ${line}`);
}

/*
 * ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------
 */

async function main() {
  console.log('=== Cude.new Architecture Verification ===');
  console.log('Executing the real pipeline (not a source-text scan).');

  let api;

  try {
    api = await loadCudeModules(ARCHITECTURE_MODULES);
  } catch (error) {
    console.error('\nFATAL: architecture modules failed to build.');
    console.error(error.message);
    process.exit(1);
  }

  const {
    planProductArchitecture,
    addTargetToArchitecture,
    overrideArchitectureStack,
    architectureToManifest,
    architectureFromManifest,
    summarizeArchitecture,
    extractRequirements,
    selectStack,
    isAtLeast,
    serializeManifest,
    deserializeManifest,
    validateManifest,
    validateProductGraph,
    hasRelationship,
    adaptationsDiffer,
    NODE_IDS,
  } = api;

  /* ================= 1. Requirements extraction ================= */
  section('1. Engineering requirements extraction');

  const caseA = extractRequirements(
    'Build a very lightweight Windows desktop Markdown editor. Startup speed and low memory usage matter more than development speed.',
  ).requirements;

  check('CASE A detects the desktop target', caseA.targetPlatforms.includes('desktop'));
  check('CASE A raises startup speed priority', isAtLeast(caseA.startupSpeedPriority, 'high'));
  check('CASE A raises memory priority', isAtLeast(caseA.memoryPriority, 'high'));
  check('CASE A raises binary size priority', isAtLeast(caseA.binarySizePriority, 'high'));
  check('CASE A demotes development speed', caseA.developmentSpeedPriority === 'low');

  const caseB = extractRequirements(
    'Build an internal admin dashboard quickly. It only needs to run in the browser.',
  ).requirements;

  check('CASE B detects the web target', caseB.targetPlatforms.includes('web'));
  check('CASE B does not invent a desktop target', !caseB.targetPlatforms.includes('desktop'));
  check('CASE B raises development velocity', isAtLeast(caseB.developmentSpeedPriority, 'high'));
  check('CASE B does not invent memory constraints', caseB.memoryPriority === 'unspecified');

  const caseC = extractRequirements('Build an Android application using Kotlin.').requirements;
  check('CASE C detects the android target', caseC.targetPlatforms.includes('android'));
  check('CASE C captures Kotlin as preferred', caseC.preferredLanguages.includes('kotlin'));

  const caseD = extractRequirements('Build a desktop application but do not use Rust.').requirements;
  check('CASE D detects the desktop target', caseD.targetPlatforms.includes('desktop'));
  check('CASE D forbids Rust', caseD.forbiddenLanguages.includes('rust'));
  check('CASE D does not also prefer Rust', !caseD.preferredLanguages.includes('rust'));

  const bare = extractRequirements('Build a desktop app.').requirements;
  check(
    'A bare platform request infers no performance constraints',
    bare.memoryPriority === 'unspecified' && bare.binarySizePriority === 'unspecified',
  );

  /* ================= 2. Stack scoring and constraints ================= */
  section('2. Stack intelligence');

  const decisionA = selectStack('', 'desktop', caseA, {});
  check('CASE A evaluates multiple candidates', decisionA.candidates.length >= 3, `${decisionA.candidates.length}`);
  check(
    'CASE A selects a small, low-memory stack',
    decisionA.selected.bundleSize === 'small' && decisionA.selected.memoryMB < 100,
  );
  check('CASE A does not select Electron', decisionA.selected.id !== 'electron');
  check('CASE A justifies the choice', decisionA.reasons.length > 0);
  check('CASE A offers alternatives', decisionA.alternatives.length > 0);
  info(`selected: ${decisionA.selected.name} (${decisionA.selected.language})`);
  info(`alternatives: ${decisionA.alternatives.map((a) => a.name).join(', ')}`);

  const decisionB = selectStack('', 'web', caseB, {});
  check('CASE B selects a high-velocity stack', decisionB.selected.scores.developmentVelocity > 0.8);
  info(`selected: ${decisionB.selected.name}`);

  const decisionC = selectStack('', 'android', caseC, { preferredLanguages: ['kotlin'] });
  check('CASE C honours the hard language override', decisionC.selected.language === 'kotlin');
  info(`selected: ${decisionC.selected.name}`);

  const decisionD = selectStack('', 'desktop', caseD, { forbiddenLanguages: ['rust'] });
  const tauri = decisionD.candidates.find((c) => c.id === 'tauri');
  check('CASE D never selects the forbidden language', decisionD.selected.language !== 'rust');
  check('CASE D marks the Rust candidate rejected', !!tauri && tauri.rejected === true);
  check('CASE D scores the rejected candidate at zero', !!tauri && tauri.totalScore === 0);
  check('CASE D hides rejected stacks from alternatives', !decisionD.alternatives.some((a) => a.language === 'rust'));
  info(`selected: ${decisionD.selected.name}`);

  // Scoring must be requirement-driven, not a fixed platform mapping.
  const fastReqs = extractRequirements('Build a desktop app as quickly as possible.').requirements;
  const leanReqs = extractRequirements(
    'Build a lightweight desktop app with low memory usage and fast startup.',
  ).requirements;
  const fastWinner = selectStack('', 'desktop', fastReqs).selected.id;
  const leanWinner = selectStack('', 'desktop', leanReqs).selected.id;
  check('Stack choice is not a fixed platform mapping', fastWinner !== leanWinner, `${fastWinner} vs ${leanWinner}`);
  info(`ship-fast -> ${fastWinner}; lean -> ${leanWinner}`);

  /* ================= 3. Product family ================= */
  section('3. Connected product family');

  const FAMILY_PROMPT =
    'Build an expense tracker for Android and Windows desktop. ' +
    'Users sign in with the same account. ' +
    'Expenses created on either device must synchronize. ' +
    'It should work offline and sync when the connection returns. ' +
    'Keep the desktop application lightweight.';

  const family = planProductArchitecture(FAMILY_PROMPT);

  check('Android target planned', !!family.stackDecisions.android);
  check('Desktop target planned', !!family.stackDecisions.desktop);
  check(
    'Targets received independent stack decisions',
    family.stackDecisions.android.selected.id !== family.stackDecisions.desktop.selected.id,
  );
  check('Desktop honours the lightweight instruction', family.stackDecisions.desktop.selected.bundleSize === 'small');
  check('Offline requirement captured', family.requirements.offlineRequirements === true);
  check(
    'Conflict resolution planned for offline + sync',
    family.requirements.synchronizationRequirements.includes('conflict-resolution'),
  );

  const graph = family.productGraph;
  const nodeIds = graph.nodes.map((n) => n.id);

  check('Shared authentication service exists', nodeIds.includes(NODE_IDS.auth));
  check('Shared API exists', nodeIds.includes(NODE_IDS.api));
  check('Shared database exists', nodeIds.includes(NODE_IDS.database));
  check('Sync service exists', nodeIds.includes(NODE_IDS.sync));
  check('Shared contracts exist', nodeIds.includes(NODE_IDS.contracts));
  check('Single shared design identity', graph.nodes.filter((n) => n.type === 'design').length === 1);

  check('ANDROID -> SHARES_AUTH -> AUTH', hasRelationship(graph, 'target-android', 'SHARES_AUTH', NODE_IDS.auth));
  check('DESKTOP -> SHARES_AUTH -> AUTH', hasRelationship(graph, 'target-desktop', 'SHARES_AUTH', NODE_IDS.auth));
  check('ANDROID -> USES_API -> API', hasRelationship(graph, 'target-android', 'USES_API', NODE_IDS.api));
  check('DESKTOP -> USES_API -> API', hasRelationship(graph, 'target-desktop', 'USES_API', NODE_IDS.api));
  check('ANDROID -> SYNC_WITH -> SYNC', hasRelationship(graph, 'target-android', 'SYNC_WITH', NODE_IDS.sync));
  check('DESKTOP -> SYNC_WITH -> SYNC', hasRelationship(graph, 'target-desktop', 'SYNC_WITH', NODE_IDS.sync));
  check('API -> USES_DATABASE -> DATABASE', hasRelationship(graph, NODE_IDS.api, 'USES_DATABASE', NODE_IDS.database));

  const graphValidation = validateProductGraph(graph);
  check('Product graph validates cleanly', graphValidation.valid, graphValidation.issues.join('; '));

  info(`android: ${family.stackDecisions.android.selected.name}`);
  info(`desktop: ${family.stackDecisions.desktop.selected.name}`);

  /* ================= 4. Platform design adaptation ================= */
  section('4. Platform-specific design adaptation');

  const androidAdapter = family.platformAdapters.android;
  const desktopAdapter = family.platformAdapters.desktop;

  check('Android adapter exists', !!androidAdapter);
  check('Desktop adapter exists', !!desktopAdapter);
  check('Android is touch-first', androidAdapter.profile.inputMethod === 'touch');
  check('Android uses >= 48px touch targets', androidAdapter.touchTargetMin >= 48);
  check('Desktop uses denser interaction targets', desktopAdapter.touchTargetMin < androidAdapter.touchTargetMin);
  check('Navigation differs per platform', androidAdapter.navigationPattern !== desktopAdapter.navigationPattern);
  check('Adaptations are genuinely different', adaptationsDiffer(androidAdapter, desktopAdapter));
  check(
    'Shared identity is preserved across targets',
    androidAdapter.designSystem.meta.preset === desktopAdapter.designSystem.meta.preset &&
      androidAdapter.designSystem.colors.accent === desktopAdapter.designSystem.colors.accent &&
      androidAdapter.designSystem.typography.fontFamily === desktopAdapter.designSystem.typography.fontFamily,
  );
  info(`android nav: ${androidAdapter.navigationPattern}; desktop nav: ${desktopAdapter.navigationPattern}`);

  /* ================= 5. Single target stays simple ================= */
  section('5. Service restraint');

  const landing = planProductArchitecture('Build a marketing landing page for a coffee shop.');
  const landingIds = landing.productGraph.nodes.map((n) => n.id);

  check('No API created for a simple landing page', !landingIds.includes(NODE_IDS.api));
  check('No database created for a simple landing page', !landingIds.includes(NODE_IDS.database));
  check('No sync service created for a simple landing page', !landingIds.includes(NODE_IDS.sync));

  /* ================= 6. Manifest persistence ================= */
  section('6. cude.project.json persistence');

  const manifest = architectureToManifest(family);
  const json = serializeManifest(manifest);
  const restoredManifest = deserializeManifest(json);
  const restored = architectureFromManifest(restoredManifest);

  check('Manifest serializes', typeof json === 'string' && json.length > 0);
  check('Manifest validates', validateManifest(manifest).valid, validateManifest(manifest).issues.join('; '));
  check('Round-trip preserves targets', restoredManifest.targets.length === manifest.targets.length);
  check(
    'Round-trip preserves relationships',
    restoredManifest.productGraph.relationships.length === graph.relationships.length,
  );
  check(
    'Round-trip preserves stack decisions',
    restored.stackDecisions.desktop.selected.id === family.stackDecisions.desktop.selected.id,
  );
  check(
    'Manifest records per-target design adaptation',
    manifest.targets.every((t) => !!t.navigationPattern),
  );

  // Secrets must never survive serialization.
  const poisoned = architectureToManifest(family);
  poisoned.requirements.customConstraints.apiKey = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
  poisoned.metadata.note = 'ghp_abcdefghijklmnopqrstuvwxyz1234';
  poisoned.productGraph.metadata.access_token = 'AKIAIOSFODNN7EXAMPLE';

  const poisonedJson = serializeManifest(poisoned);

  check('API key stripped from manifest', !poisonedJson.includes('sk-abcdefghijklmnopqrstuvwxyz1234567890'));
  check('GitHub token stripped from manifest', !poisonedJson.includes('ghp_abcdefghijklmnopqrstuvwxyz1234'));
  check('AWS key stripped from manifest', !poisonedJson.includes('AKIAIOSFODNN7EXAMPLE'));
  check('Credential-shaped keys stripped', !poisonedJson.includes('apiKey') && !poisonedJson.includes('access_token'));

  /* ================= 7. Add target ================= */
  section('7. Add target — web dashboard for the same account');

  const added = addTargetToArchitecture(family, 'web', { prompt: 'Add a web dashboard for the same account.' });
  const addedGraph = added.architecture.productGraph;

  check('Web target added', added.architecture.requirements.targetPlatforms.includes('web'));
  check(
    'Android preserved',
    addedGraph.nodes.some((n) => n.platform === 'android'),
  );
  check(
    'Desktop preserved',
    addedGraph.nodes.some((n) => n.platform === 'desktop'),
  );
  check(
    'Android stack decision untouched',
    added.architecture.stackDecisions.android.selected.id === family.stackDecisions.android.selected.id,
  );
  check(
    'Desktop stack decision untouched',
    added.architecture.stackDecisions.desktop.selected.id === family.stackDecisions.desktop.selected.id,
  );
  check('Auth reused', added.reusedServices.includes(NODE_IDS.auth));
  check('API reused', added.reusedServices.includes(NODE_IDS.api));
  check('Database reused', added.reusedServices.includes(NODE_IDS.database));
  check('No duplicate services created', addedGraph.nodes.filter((n) => n.id === NODE_IDS.auth).length === 1);
  check('New web stack decision created', added.stackDecision.target === 'web');
  check('Design identity reused', added.architecture.designSystem === family.designSystem);
  check(
    'Web shares the product design identity',
    hasRelationship(addedGraph, 'target-web', 'SHARES_DESIGN_SYSTEM', NODE_IDS.design),
  );
  check('Web-specific design adaptation created', !!added.platformAdapter && added.platformAdapter.platform === 'web');
  check(
    'Web adaptation differs from Android',
    adaptationsDiffer(added.platformAdapter, added.architecture.platformAdapters.android),
  );

  const addedValidation = validateProductGraph(addedGraph);
  check('Graph still valid after add-target', addedValidation.valid, addedValidation.issues.join('; '));
  info(`web: ${added.stackDecision.selected.name}`);

  /* ================= 8. Architecture override ================= */
  section('8. Architecture override');

  const overridden = overrideArchitectureStack(family, 'desktop', 'electron');

  check('Override changes the selected stack', overridden.stackDecisions.desktop.selected.id === 'electron');
  check(
    'Override leaves other targets alone',
    overridden.stackDecisions.android.selected.id === family.stackDecisions.android.selected.id,
  );
  check(
    'Override updates the graph node',
    overridden.productGraph.nodes.find((n) => n.platform === 'desktop').stackId === 'electron',
  );
  check('Override is a real state change', overridden.version > family.version);

  /* ================= 9. Fixture output ================= */
  section('9. Product family fixture');

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const summary = summarizeArchitecture(family);
  const addedSummary = summarizeArchitecture(added.architecture);

  fs.writeFileSync(path.join(FIXTURE_DIR, 'cude.project.json'), serializeManifest(manifest), 'utf8');
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'cude.project.with-web.json'),
    serializeManifest(architectureToManifest(added.architecture)),
    'utf8',
  );
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'architecture-summary.json'),
    JSON.stringify({ prompt: FAMILY_PROMPT, base: summary, afterAddWeb: addedSummary }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'README.md'),
    [
      '# Product Family Verification Fixture',
      '',
      'Generated by `node scripts/cude-architecture-verify.mjs`.',
      'Every file here is produced by executing the real Cude architecture pipeline —',
      'nothing in this directory is hand-written.',
      '',
      '## Prompt',
      '',
      '```',
      FAMILY_PROMPT,
      '```',
      '',
      '## Targets',
      '',
      ...summary.targets.map((t) => `- **${t.platform}** — ${t.stackName} (${t.language}/${t.framework})`),
      '',
      '## Shared services',
      '',
      ...summary.sharedServices.map((s) => `- ${s}`),
      '',
      '## Relationships',
      '',
      ...summary.relationships.map((r) => `- ${r}`),
      '',
      '## After "Add a web dashboard for the same account."',
      '',
      ...addedSummary.targets.map((t) => `- **${t.platform}** — ${t.stackName}`),
      '',
    ].join('\n'),
    'utf8',
  );

  check('Fixture manifest written', fs.existsSync(path.join(FIXTURE_DIR, 'cude.project.json')));
  check('Fixture add-target manifest written', fs.existsSync(path.join(FIXTURE_DIR, 'cude.project.with-web.json')));
  check('Fixture summary written', fs.existsSync(path.join(FIXTURE_DIR, 'architecture-summary.json')));

  /* ================= Cleanup ================= */
  cleanupCudeModules();

  /* ================= Result ================= */
  console.log('\n=== ARCHITECTURE VERIFICATION RESULT ===\n');
  console.log(`Checks run: ${checks}`);
  console.log(`Failures:   ${failures.length}`);

  if (warnings.length > 0) {
    console.log('\nWARNINGS:');

    for (const warning of warnings) {
      console.log(`  ! ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log('\nFAILURES:');

    for (const failure of failures) {
      console.log(`  x ${failure}`);
    }

    console.log('\nARCHITECTURE VERIFICATION FAILED');
    process.exit(1);
  }

  console.log('\nARCHITECTURE VERIFICATION PASSED');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFatal error during architecture verification:');
  console.error(error);
  process.exit(1);
});

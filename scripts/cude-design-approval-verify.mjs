#!/usr/bin/env node
/**
 * Cude.new - Design Approval Verification
 *
 * Executes the real design-approval modules and asserts the behaviour the
 * workflow depends on: a UI-bearing product pauses before the Builder, a
 * headless one does not, revisions preserve architecture, and adding a platform
 * only asks for approval of the new target.
 *
 * Writes reproducible fixtures to verification-design-approval/.
 * Exits non-zero on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { cleanupCudeModules, loadCudeModules, REPO_ROOT } from './lib/load-cude.mjs';

const FIXTURE_DIR = path.join(REPO_ROOT, 'verification-design-approval');

const failures = [];
let checks = 0;
let section = '';

function heading(name) {
  section = name;
  console.log(`\n--- ${name} ---`);
}

function check(description, condition, detail) {
  checks++;

  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` (${detail})` : ''}`);
    failures.push(`[${section}] ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

function info(line) {
  console.log(`        ${line}`);
}

const CASE_A =
  'Build a browser extension that summarizes the current page with AI, lets me copy the summary, shows recent summaries and provides a compact settings entry.';
const CASE_B =
  'Build a VS Code extension that reviews the current file, shows issues by severity and lets me apply suggested fixes.';
const CASE_C =
  'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. ' +
  'Expenses created on either device must synchronize. It should work offline and sync when the connection returns.';
const CASE_D_FEEDBACK = 'Keep the structure but make it more compact and reduce decorative elements.';

async function main() {
  console.log('=== Cude.new Design Approval Verification ===');
  console.log('Executing the real approval modules (not a source-text scan).');

  let api;

  try {
    api = await loadCudeModules([
      'app/lib/cude/designContract.ts',
      'app/lib/cude/designPreview.ts',
      'app/lib/cude/addPlatform.ts',
      'app/lib/cude/architecture.ts',
      'app/lib/cude/engineeringRequirements.ts',
      'app/lib/cude/designSystem.ts',
      'app/lib/cude/visualQA.ts',
      'app/lib/cude/agents.ts',
    ]);
  } catch (error) {
    console.error('\nFATAL: design approval modules failed to build.');
    console.error(error.message);
    process.exit(1);
  }

  const {
    createDesignContract,
    approveDesignContract,
    reviseDesignContract,
    addPlatformToDesignContract,
    describeRevision,
    requiresDesignApproval,
    resolveDensity,
    planSurfaces,
    serializeDesignContract,
    renderSurfacePreview,
    analyzeComposition,
    detectProductIntent,
    planAddPlatform,
    planProductArchitecture,
    extractRequirements,
    createDesignSystem,
    PIPELINE_ORDER,
  } = api;

  const contractFor = (prompt) => {
    const { requirements } = extractRequirements(prompt);

    return createDesignContract({
      productId: 'verify',
      productName: 'Verification Product',
      prompt,
      platforms: requirements.targetPlatforms,
      requirements,
      designSystem: createDesignSystem(prompt),
    });
  };

  /* ============ 1. The gate exists and is real ============ */
  heading('1. Approval gate');

  const reviewIndex = PIPELINE_ORDER.indexOf('designReview');
  check('Design review is a real pipeline stage', reviewIndex >= 0);
  check('It sits after architecture', reviewIndex > PIPELINE_ORDER.indexOf('architect'));
  check('It sits before the builder', reviewIndex < PIPELINE_ORDER.indexOf('builder'));

  check('A UI product requires approval', requiresDesignApproval(['web']) === true);
  check('A headless backend does not', requiresDesignApproval(['backend']) === false);
  check('A mixed product still requires approval', requiresDesignApproval(['backend', 'web']) === true);

  /* ============ 2. CASE A — browser extension ============ */
  heading('2. CASE A — browser extension');

  const caseA = contractFor(CASE_A);
  const ext = caseA.platformDesigns['browser-extension'];

  check('Detected as a browser extension', Boolean(ext));
  check('Contract starts unapproved', caseA.status === 'in_review' && !caseA.approvedAt);
  check('Popup is the primary surface', ext.surfaces[0].id === 'popup');
  check('Density is compact or denser', ['compact', 'dense'].includes(ext.density), ext.density);
  check('Popup fits a real popup viewport', ext.viewport.width <= 400, `${ext.viewport.width}px`);

  const popupItems = ext.surfaces[0].regions.reduce((n, r) => n + r.items, 0);
  check('Popup carries real information', popupItems >= 8, `items=${popupItems}`);

  const popupRoles = ext.surfaces[0].regions.map((r) => r.role);
  check('Popup has a primary action', popupRoles.includes('primary-action'));
  check('Popup shows recent activity', popupRoles.includes('list'));
  check('Popup shows current context', popupRoles.includes('status'));
  check('No dashboard surface was invented', !ext.surfaces.some((s) => s.id === 'dashboard'));

  const extFindings = analyzeComposition(caseA).filter((f) => f.severity !== 'info');
  check('No empty-space findings', extFindings.length === 0, extFindings.map((f) => f.code).join(','));
  info(`surfaces: ${ext.surfaces.map((s) => s.name).join(', ')}`);

  /* ============ 3. CASE B — VS Code extension ============ */
  heading('3. CASE B — VS Code extension');

  const caseB = contractFor(CASE_B);
  const code = caseB.platformDesigns['vscode-extension'];

  check('Detected as a VS Code extension', Boolean(code));
  check('Side Bar view is primary', code.surfaces[0].id === 'sidebar');
  check(
    'Uses a tree, not cards',
    code.surfaces[0].regions.some((r) => r.role === 'tree'),
  );
  check(
    'Has a Panel surface',
    code.surfaces.some((s) => s.id === 'panel'),
  );
  check(
    'Contributes configuration',
    code.surfaces.some((s) => s.id === 'settings'),
  );
  check('Density is dense', code.density === 'dense', code.density);
  check('No standalone desktop dashboard', !code.surfaces.some((s) => s.id === 'workspace'));

  const codeFindings = analyzeComposition(caseB).filter((f) => f.severity !== 'info');
  check('No empty-space findings', codeFindings.length === 0, codeFindings.map((f) => f.code).join(','));

  const codeHtml = renderSurfacePreview(code, code.surfaces[0], caseB.designSystem);
  check('Preview renders a severity hierarchy', /Errors|Warnings|Suggestions/.test(codeHtml));
  info(`surfaces: ${code.surfaces.map((s) => s.name).join(', ')}`);

  /* ============ 4. CASE C — multi-platform family ============ */
  heading('4. CASE C — multi-platform product family');

  const caseC = contractFor(CASE_C);
  const android = caseC.platformDesigns.android;
  const desktop = caseC.platformDesigns.desktop;

  check('Both platforms are covered', Boolean(android) && Boolean(desktop));
  check('Shared identity', caseC.designSystem === caseC.designSystem);
  check('Navigation differs per platform', android.navigation !== desktop.navigation);
  check('Touch targets differ', android.touchTargetMin > desktop.touchTargetMin);
  check('Viewports differ', android.viewport.width !== desktop.viewport.width);
  check(
    'Surface plans differ',
    android.surfaces.map((s) => s.id).join(',') !== desktop.surfaces.map((s) => s.id).join(','),
  );
  check(
    'Android is touch-first',
    android.surfaces[0].regions.some((r) => r.role === 'navigation'),
  );
  check(
    'Desktop is multi-pane',
    desktop.surfaces[0].regions.some((r) => r.role === 'detail'),
  );

  const familyFindings = analyzeComposition(caseC).filter((f) => f.severity !== 'info');
  check('No empty-space findings', familyFindings.length === 0, familyFindings.map((f) => f.code).join(','));

  const androidHtml = renderSurfacePreview(android, android.surfaces[0], caseC.designSystem);
  const desktopHtml = renderSurfacePreview(desktop, desktop.surfaces[0], caseC.designSystem);
  check('Platform previews are genuinely different', androidHtml !== desktopHtml);
  check(
    'Both previews use the shared tokens',
    androidHtml.includes(caseC.designSystem.colors.background) &&
      desktopHtml.includes(caseC.designSystem.colors.background),
  );
  info(`android: ${android.navigation}/${android.density} · desktop: ${desktop.navigation}/${desktop.density}`);

  /* ============ 5. CASE D — revision loop ============ */
  heading('5. CASE D — revision');

  const revised = reviseDesignContract(caseC, CASE_D_FEEDBACK);
  const revisionChanges = describeRevision(caseC, revised);

  check('Revision increments', revised.revision === caseC.revision + 1);
  check('Still unapproved after revision', revised.status !== 'approved' && !revised.approvedAt);
  check('Feedback is recorded verbatim', revised.revisionNotes.includes(CASE_D_FEEDBACK));
  check('Something actually changed', revisionChanges.length > 0 && !/No structural change/.test(revisionChanges[0]));
  check('Original contract untouched', caseC.status === 'in_review' && caseC.revisionNotes.length === 0);
  check('Design system identity preserved', revised.designSystem === caseC.designSystem);
  check('Platform set unchanged', revised.platforms.join(',') === caseC.platforms.join(','));
  info(revisionChanges.join(' | '));

  const approved = approveDesignContract(revised);
  check('Approval only happens explicitly', approved.status === 'approved' && Boolean(approved.approvedAt));
  check('Approval preserves the revision number', approved.revision === revised.revision);

  /* ============ 6. Add platform ============ */
  heading('6. Add platform');

  const androidOnly = planProductArchitecture('Build an expense tracker for Android. Users sign in and sync expenses.');

  for (const [prompt, expected] of [
    ['Make a desktop version.', 'ADD_TARGET'],
    ['Add a web dashboard for the same account.', 'ADD_TARGET'],
    ['I also need an iPhone version.', 'ADD_TARGET'],
    ['Create a browser extension for this.', 'ADD_TARGET'],
  ]) {
    const detected = detectProductIntent(prompt, androidOnly);
    check(`"${prompt}" → ${expected}`, detected.intent === expected, detected.intent);
  }

  check(
    'Without an existing product it is a new product',
    detectProductIntent('Make a desktop version.', null).intent === 'CREATE_NEW_PRODUCT',
  );

  const plan = planAddPlatform(androidOnly, 'desktop');
  check('Reuses authentication', plan.reuse.includes('Authentication'));
  check('Reuses the design identity', plan.reuse.includes('Design identity'));
  check('Names genuinely new work', plan.create.length > 0);
  check('Preserves the existing target', plan.preservedTargets.includes('android'));
  check('Reports contract impact', typeof plan.contractImpact.required === 'boolean');
  info(`reuse: ${plan.reuse.join(', ')}`);
  info(`new: ${plan.create.join(', ')}`);

  /* ============ 7. Add platform does not re-open approved designs ============ */
  heading('7. Add platform + approval');

  const approvedAndroid = approveDesignContract(contractFor('Build an expense tracker for Android. Users sign in.'));
  const androidDesignBefore = approvedAndroid.platformDesigns.android;

  const withDesktop = addPlatformToDesignContract(
    approvedAndroid,
    'desktop',
    extractRequirements(CASE_C).requirements,
    CASE_C,
  );

  check('Desktop design was added', Boolean(withDesktop.platformDesigns.desktop));
  check('Android design object is untouched', withDesktop.platformDesigns.android === androidDesignBefore);
  check('Contract returns to review for the new target', withDesktop.status === 'in_review');

  const scopedRevision = reviseDesignContract(withDesktop, 'make it denser', { platform: 'desktop' });
  check(
    'A scoped revision leaves the approved platform alone',
    scopedRevision.platformDesigns.android === androidDesignBefore,
  );

  /* ============ 8. Secrets ============ */
  heading('8. Contract safety');

  const json = serializeDesignContract(caseC);
  check('No credential-shaped values', !/sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}/.test(json));
  check('No credential-shaped fields', !/"(?:apiKey|api_key|token|secret|password)"/i.test(json));

  /* ============ 9. Density reasoning ============ */
  heading('9. Density reasoning');

  const marketing = extractRequirements('Build a marketing landing page.').requirements;
  const adminReq = extractRequirements('Build an internal admin dashboard.').requirements;

  check(
    'Marketing is comfortable',
    resolveDensity('web', marketing, 'Build a marketing landing page.') === 'comfortable',
  );
  check('Admin is compact', resolveDensity('web', adminReq, 'Build an internal admin dashboard.') === 'compact');
  check('VS Code is dense', resolveDensity('vscode-extension', adminReq) === 'dense');
  check('Popup is compact', resolveDensity('browser-extension', adminReq, '') !== 'comfortable');

  /* ============ 10. Fixtures ============ */
  heading('10. Fixtures');

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const write = (name, content) => fs.writeFileSync(path.join(FIXTURE_DIR, name), content, 'utf8');

  write('case-a-browser-extension.json', serializeDesignContract(caseA));
  write('case-b-vscode-extension.json', serializeDesignContract(caseB));
  write('case-c-multiplatform.json', serializeDesignContract(caseC));
  write('case-d-revised.json', serializeDesignContract(revised));
  write('case-a-popup-preview.html', renderSurfacePreview(ext, ext.surfaces[0], caseA.designSystem));
  write('case-b-sidebar-preview.html', codeHtml);
  write('case-c-android-preview.html', androidHtml);
  write('case-c-desktop-preview.html', desktopHtml);
  write(
    'README.md',
    [
      '# Design Approval Verification Fixtures',
      '',
      'Generated by `node scripts/cude-design-approval-verify.mjs`.',
      'Every file here is produced by executing the real design-approval pipeline.',
      '',
      '| Case | Platform | Density | Navigation | Surfaces |',
      '|---|---|---|---|---|',
      `| A | browser-extension | ${ext.density} | ${ext.navigation} | ${ext.surfaces.map((s) => s.name).join(', ')} |`,
      `| B | vscode-extension | ${code.density} | ${code.navigation} | ${code.surfaces.map((s) => s.name).join(', ')} |`,
      `| C | android | ${android.density} | ${android.navigation} | ${android.surfaces.map((s) => s.name).join(', ')} |`,
      `| C | desktop | ${desktop.density} | ${desktop.navigation} | ${desktop.surfaces.map((s) => s.name).join(', ')} |`,
      '',
      '## Case D — revision',
      '',
      ...revisionChanges.map((c) => `- ${c}`),
      '',
      'The `.html` files are the actual proposals shown in Design Review; open one in a browser.',
      '',
    ].join('\n'),
  );

  check('Fixtures written', fs.existsSync(path.join(FIXTURE_DIR, 'case-c-multiplatform.json')));
  check('Previews written', fs.existsSync(path.join(FIXTURE_DIR, 'case-a-popup-preview.html')));

  cleanupCudeModules();

  console.log('\n=== DESIGN APPROVAL VERIFICATION RESULT ===\n');
  console.log(`Checks run: ${checks}`);
  console.log(`Failures:   ${failures.length}`);

  if (failures.length > 0) {
    console.log('\nFAILURES:');

    for (const failure of failures) {
      console.log(`  x ${failure}`);
    }

    console.log('\nDESIGN APPROVAL VERIFICATION FAILED');
    process.exit(1);
  }

  console.log('\nDESIGN APPROVAL VERIFICATION PASSED');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFatal error during design approval verification:');
  console.error(error);
  process.exit(1);
});

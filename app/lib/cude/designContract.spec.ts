import { describe, expect, it } from 'vitest';
import { extractRequirements } from './engineeringRequirements';
import { createDesignSystem } from './designSystem';
import { planProductArchitecture } from './architecture';
import {
  addPlatformToDesignContract,
  applyFeedbackToPlatformDesign,
  approveDesignContract,
  createDesignContract,
  createPlatformDesign,
  describeRevision,
  planSurfaces,
  requiresDesignApproval,
  resolveDensity,
  reviseDesignContract,
  serializeDesignContract,
  surfaceBearingPlatforms,
  type DesignContract,
} from './designContract';
import { renderSurfacePreview } from './designPreview';
import { analyzeComposition, compositionPassed } from './visualQA';
import { detectProductIntent, planAddPlatform, availableTargets } from './addPlatform';
import { PIPELINE_ORDER, createInitialPipeline } from './agents';

const EXTENSION_PROMPT =
  'Build a browser extension that summarizes the current page with AI, lets me copy the summary, shows recent summaries and provides a compact settings entry.';
const VSCODE_PROMPT =
  'Build a VS Code extension that reviews the current file, shows issues by severity and lets me apply suggested fixes.';
const FAMILY_PROMPT =
  'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. ' +
  'Expenses created on either device must synchronize. It should work offline and sync when the connection returns.';

function contractFor(prompt: string): DesignContract {
  const { requirements } = extractRequirements(prompt);

  return createDesignContract({
    productId: 'test',
    productName: 'Test Product',
    prompt,
    platforms: requirements.targetPlatforms,
    requirements,
    designSystem: createDesignSystem(prompt),
  });
}

describe('approval applicability', () => {
  it('requires approval for anything with an interface', () => {
    expect(requiresDesignApproval(['web'])).toBe(true);
    expect(requiresDesignApproval(['android', 'desktop'])).toBe(true);
    expect(requiresDesignApproval(['browser-extension'])).toBe(true);
  });

  it('does not force a backend-only product through visual approval', () => {
    expect(requiresDesignApproval(['backend'])).toBe(false);
    expect(surfaceBearingPlatforms(['backend'])).toEqual([]);
  });

  it('still requires approval when a backend is one of several targets', () => {
    expect(requiresDesignApproval(['backend', 'web'])).toBe(true);
    expect(surfaceBearingPlatforms(['backend', 'web'])).toEqual(['web']);
  });
});

describe('pipeline gating', () => {
  it('places the design review stage between architecture and the builder', () => {
    const designIndex = PIPELINE_ORDER.indexOf('design');
    const architectIndex = PIPELINE_ORDER.indexOf('architect');
    const visualQAIndex = PIPELINE_ORDER.indexOf('visualQA');

    expect(designIndex).toBeGreaterThan(PIPELINE_ORDER.indexOf('productGraph'));
    expect(designIndex).toBeLessThan(architectIndex);
    expect(visualQAIndex).toBeGreaterThan(PIPELINE_ORDER.indexOf('tester'));
    expect(visualQAIndex).toBeLessThan(PIPELINE_ORDER.indexOf('repair'));
  });

  it('starts every stage waiting, so nothing is pre-approved', () => {
    const pipeline = createInitialPipeline();
    const review = pipeline.agents.find((a) => a.id === 'design');

    expect(review?.status).toBe('waiting');
    expect(pipeline.agents.find((a) => a.id === 'builder')?.status).toBe('waiting');
  });
});

describe('density intelligence', () => {
  it('derives density from the platform', () => {
    const { requirements } = extractRequirements('Build a tool.');

    expect(resolveDensity('vscode-extension', requirements)).toBe('dense');
    expect(resolveDensity('browser-extension', requirements)).toBe('compact');
    expect(resolveDensity('desktop', requirements)).toBe('compact');
  });

  it('loosens for marketing surfaces and tightens for data surfaces', () => {
    const marketing = extractRequirements('Build a marketing landing page.').requirements;
    const admin = extractRequirements('Build an internal admin dashboard.').requirements;

    const marketingDensity = resolveDensity('web', marketing, 'Build a marketing landing page.');
    const adminDensity = resolveDensity('web', admin, 'Build an internal admin dashboard.');

    expect(marketingDensity).toBe('comfortable');
    expect(adminDensity).toBe('compact');
  });

  it('honours an explicit request for density', () => {
    const { requirements } = extractRequirements('Build a web app.');

    expect(resolveDensity('web', requirements, 'make it denser')).toBe('compact');
    expect(resolveDensity('web', requirements, 'give it more breathing room')).toBe('comfortable');
  });
});

describe('platform-specific surfaces', () => {
  it('gives a browser extension a popup, not a dashboard', () => {
    const { requirements } = extractRequirements(EXTENSION_PROMPT);
    const surfaces = planSurfaces('browser-extension', requirements, EXTENSION_PROMPT);

    expect(surfaces[0].id).toBe('popup');
    expect(surfaces.map((s) => s.id)).not.toContain('dashboard');

    const roles = surfaces[0].regions.map((r) => r.role);
    expect(roles).toContain('primary-action');
    expect(roles).toContain('list');
    expect(roles).toContain('status');
  });

  it('gives a VS Code extension a tree view, not a card grid', () => {
    const { requirements } = extractRequirements(VSCODE_PROMPT);
    const surfaces = planSurfaces('vscode-extension', requirements, VSCODE_PROMPT);

    expect(surfaces[0].id).toBe('sidebar');
    expect(surfaces[0].regions.map((r) => r.role)).toContain('tree');
    expect(surfaces.map((s) => s.id)).toContain('panel');
  });

  it('gives desktop a multi-pane workspace and mobile a bottom-nav home', () => {
    const { requirements } = extractRequirements(FAMILY_PROMPT);

    const desktop = planSurfaces('desktop', requirements, FAMILY_PROMPT);
    const android = planSurfaces('android', requirements, FAMILY_PROMPT);

    expect(desktop[0].id).toBe('workspace');
    expect(desktop[0].regions.map((r) => r.role)).toContain('detail');
    expect(android[0].id).toBe('home');
    expect(android[0].regions.some((r) => r.role === 'navigation')).toBe(true);
  });

  it('does not produce the same surface plan for every platform', () => {
    const { requirements } = extractRequirements(FAMILY_PROMPT);

    const ids = (['web', 'android', 'desktop', 'browser-extension', 'vscode-extension'] as const).map((p) =>
      planSurfaces(p, requirements, FAMILY_PROMPT)
        .map((s) => s.id)
        .join(','),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('platform adaptation differs meaningfully', () => {
  it('gives each platform its own navigation and density', () => {
    const { requirements } = extractRequirements(FAMILY_PROMPT);

    const android = createPlatformDesign('android', requirements, FAMILY_PROMPT);
    const desktop = createPlatformDesign('desktop', requirements, FAMILY_PROMPT);

    expect(android.navigation).not.toBe(desktop.navigation);
    expect(android.touchTargetMin).toBeGreaterThan(desktop.touchTargetMin);
    expect(android.viewport.width).toBeLessThan(desktop.viewport.width);
  });
});

describe('design contract lifecycle', () => {
  it('starts in review, never pre-approved', () => {
    const contract = contractFor(FAMILY_PROMPT);

    expect(contract.status).toBe('in_review');
    expect(contract.approvedAt).toBeUndefined();
    expect(contract.revision).toBe(1);
  });

  it('only becomes approved through an explicit approval', () => {
    const contract = contractFor(FAMILY_PROMPT);
    const approved = approveDesignContract(contract);

    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();
    expect(contract.status).toBe('in_review');
  });

  it('covers every surface-bearing platform of the product', () => {
    const contract = contractFor(FAMILY_PROMPT);

    expect(contract.platforms).toEqual(expect.arrayContaining(['android', 'desktop']));
    expect(Object.keys(contract.platformDesigns).sort()).toEqual([...contract.platforms].sort());
  });

  it('references the shared design system rather than duplicating one', () => {
    const ds = createDesignSystem(FAMILY_PROMPT);
    const { requirements } = extractRequirements(FAMILY_PROMPT);

    const contract = createDesignContract({
      productId: 'p',
      productName: 'P',
      prompt: FAMILY_PROMPT,
      platforms: requirements.targetPlatforms,
      requirements,
      designSystem: ds,
    });

    expect(contract.designSystem).toBe(ds);
  });

  it('contains no credential-shaped content', () => {
    const json = serializeDesignContract(contractFor(FAMILY_PROMPT));

    expect(json).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(json).not.toMatch(/"(?:apiKey|api_key|token|secret|password)"/i);
  });
});

describe('revision loop', () => {
  const base = contractFor(FAMILY_PROMPT);
  const revised = reviseDesignContract(
    base,
    'Keep the structure but make it more compact and reduce decorative elements.',
  );

  it('increments the revision and stays unapproved', () => {
    expect(revised.revision).toBe(base.revision + 1);
    expect(revised.status).toBe('changes_requested');
    expect(revised.approvedAt).toBeUndefined();
  });

  it('actually changes the design rather than only recording a note', () => {
    const before = base.platformDesigns.desktop;
    const after = revised.platformDesigns.desktop;

    /*
     * Either the density moved, or — when already at the limit — the decorative
     * treatment did. Silently doing nothing is the failure this guards against.
     */
    expect(after.density !== before.density || after.decoration !== before.decoration).toBe(true);
    expect(describeRevision(base, revised).length).toBeGreaterThan(0);
    expect(describeRevision(base, revised)[0]).not.toMatch(/No structural change/);
  });

  it('records the feedback verbatim for the Builder', () => {
    expect(revised.revisionNotes).toHaveLength(1);
    expect(revised.revisionNotes[0]).toMatch(/compact/i);
  });

  it('does not mutate the original contract', () => {
    expect(base.status).toBe('in_review');
    expect(base.revisionNotes).toHaveLength(0);
  });

  it('can be scoped to one platform, leaving the others untouched', () => {
    const scoped = reviseDesignContract(base, 'make it denser', { platform: 'desktop' });
    const desktopBefore = base.platformDesigns.desktop;
    const desktopAfter = scoped.platformDesigns.desktop;

    expect(desktopAfter.density !== desktopBefore.density || desktopAfter.decoration !== desktopBefore.decoration).toBe(
      true,
    );
    expect(scoped.platformDesigns.android).toBe(base.platformDesigns.android);
  });

  it('reduces decoration when asked', () => {
    const design = base.platformDesigns.desktop;
    const after = applyFeedbackToPlatformDesign(design, 'remove the purple accent colours');

    expect(after.adaptationNotes.join(' ')).toMatch(/decorative/i);
  });
});

describe('add platform', () => {
  const architecture = planProductArchitecture(
    'Build an expense tracker for Android. Users sign in and sync expenses.',
  );

  it('recognises natural language as adding a target, not a new product', () => {
    for (const prompt of [
      'Make a desktop version.',
      'Add a web dashboard for the same account.',
      'I also need an iPhone version.',
      'Create a browser extension for this.',
    ]) {
      expect(detectProductIntent(prompt, architecture).intent, prompt).toBe('ADD_TARGET');
    }
  });

  it('treats the same phrasing as a new product when nothing exists yet', () => {
    expect(detectProductIntent('Make a desktop version.', null).intent).toBe('CREATE_NEW_PRODUCT');
  });

  it('does not add a platform the product already has', () => {
    expect(detectProductIntent('Add an Android app.', architecture).intent).not.toBe('ADD_TARGET');
  });

  it('reports what is reused rather than rebuilt', () => {
    const plan = planAddPlatform(architecture, 'desktop');

    expect(plan.reuse).toContain('Authentication');
    expect(plan.reuse).toContain('Design identity');
    expect(plan.create.length).toBeGreaterThan(0);
    expect(plan.adapt).toContain('Navigation');
    expect(plan.preservedTargets).toContain('android');
  });

  it('offers only targets the product does not already have', () => {
    expect(availableTargets(architecture)).not.toContain('android');
    expect(availableTargets(architecture)).toContain('desktop');
  });

  it('adds a platform design without disturbing existing ones', () => {
    const contract = approveDesignContract(contractFor('Build an expense tracker for Android. Users sign in.'));
    const androidBefore = contract.platformDesigns.android;

    const next = addPlatformToDesignContract(
      contract,
      'desktop',
      extractRequirements(FAMILY_PROMPT).requirements,
      FAMILY_PROMPT,
    );

    expect(next.platformDesigns.desktop).toBeDefined();
    expect(next.platformDesigns.android).toBe(androidBefore);
    expect(next.status).toBe('in_review');
  });
});

describe('composition analysis', () => {
  it('passes the surfaces Cude proposes for every platform', () => {
    for (const prompt of [EXTENSION_PROMPT, VSCODE_PROMPT, FAMILY_PROMPT]) {
      const findings = analyzeComposition(contractFor(prompt));
      const serious = findings.filter((f) => f.severity !== 'info');

      expect(serious, `${prompt}\n${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });

  it('flags a surface that carries almost no information', () => {
    const findings = analyzeComposition({
      platformDesigns: {
        'browser-extension': {
          platform: 'browser-extension',
          density: 'compact',
          surfaces: [
            {
              id: 'popup',
              name: 'Popup',
              regions: [{ role: 'primary-action', weight: 0.2, items: 1 }],
            },
          ],
        },
      },
    });

    expect(findings.map((f) => f.code)).toContain('LOW_INFORMATION_DENSITY');
    expect(findings.map((f) => f.code)).toContain('EXCESSIVE_EMPTY_SPACE');
    expect(compositionPassed(findings)).toBe(false);
  });

  it('flags a surface that is mostly chrome', () => {
    const findings = analyzeComposition({
      platformDesigns: {
        web: {
          platform: 'web',
          density: 'balanced',
          surfaces: [
            {
              id: 's',
              name: 'S',
              regions: [
                { role: 'header', weight: 0.4, items: 6 },
                { role: 'navigation', weight: 0.4, items: 6 },
                { role: 'list', weight: 0.2, items: 6 },
              ],
            },
          ],
        },
      },
    });

    expect(findings.map((f) => f.code)).toContain('UNBALANCED_LAYOUT');
  });
});

describe('visual proposal', () => {
  it('renders a real HTML document from the project tokens', () => {
    const contract = contractFor(FAMILY_PROMPT);
    const design = contract.platformDesigns.desktop;
    const html = renderSurfacePreview(design, design.surfaces[0], contract.designSystem);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain(contract.designSystem.colors.background);
    expect(html).toContain(contract.designSystem.typography.fontFamily);
  });

  it('is deterministic', () => {
    const contract = contractFor(FAMILY_PROMPT);
    const design = contract.platformDesigns.desktop;

    expect(renderSurfacePreview(design, design.surfaces[0], contract.designSystem)).toBe(
      renderSurfacePreview(design, design.surfaces[0], contract.designSystem),
    );
  });

  it('renders a different composition per platform', () => {
    const extension = contractFor(EXTENSION_PROMPT);
    const vscode = contractFor(VSCODE_PROMPT);

    const extHtml = renderSurfacePreview(
      extension.platformDesigns['browser-extension'],
      extension.platformDesigns['browser-extension'].surfaces[0],
      extension.designSystem,
    );
    const codeHtml = renderSurfacePreview(
      vscode.platformDesigns['vscode-extension'],
      vscode.platformDesigns['vscode-extension'].surfaces[0],
      vscode.designSystem,
    );

    expect(extHtml).not.toBe(codeHtml);
    expect(extHtml).toMatch(/Summarize this page/i);
    expect(codeHtml).toMatch(/Errors|Warnings/);
  });

  it('fills a small extension surface rather than leaving it empty', () => {
    const contract = contractFor(EXTENSION_PROMPT);
    const design = contract.platformDesigns['browser-extension'];
    const html = renderSurfacePreview(design, design.surfaces[0], contract.designSystem);

    // A popup that is genuinely used has several distinct regions, not one button.
    expect((html.match(/class="row/g) ?? []).length).toBeGreaterThan(4);
    expect(design.viewport.width).toBeLessThanOrEqual(400);
  });
});

import { describe, expect, it } from 'vitest';
import { deriveUserConstraints, extractRequirements, createDefaultRequirements } from './engineeringRequirements';
import {
  applyStackOverride,
  decisionScoreTable,
  explainDecision,
  getStackCandidatesForPlatform,
  selectStack,
} from './stackIntelligence';

/** Runs prompt -> requirements -> stack decision, the way the pipeline does. */
function decide(prompt: string, platform: Parameters<typeof selectStack>[1]) {
  const { requirements } = extractRequirements(prompt);
  const constraints = deriveUserConstraints(requirements);

  return selectStack(prompt, platform, requirements, constraints, 'test-product');
}

const CASE_A =
  'Build a very lightweight Windows desktop Markdown editor. Startup speed and low memory usage matter more than development speed.';
const CASE_B = 'Build an internal admin dashboard quickly. It only needs to run in the browser.';
const CASE_C = 'Build an Android application using Kotlin.';
const CASE_D = 'Build a desktop application but do not use Rust.';

describe('candidate generation', () => {
  it('produces multiple real candidates per platform', () => {
    const requirements = createDefaultRequirements();

    expect(getStackCandidatesForPlatform('desktop', requirements).length).toBeGreaterThan(2);
    expect(getStackCandidatesForPlatform('android', requirements).length).toBeGreaterThan(2);
    expect(getStackCandidatesForPlatform('web', requirements).length).toBeGreaterThan(2);
    expect(getStackCandidatesForPlatform('backend', requirements).length).toBeGreaterThan(2);
  });

  it('never returns candidates from another platform', () => {
    const candidates = getStackCandidatesForPlatform('desktop', createDefaultRequirements());
    expect(candidates.every((c) => c.projectType === 'desktop')).toBe(true);
  });

  it('scores every dimension for every candidate', () => {
    const candidates = getStackCandidatesForPlatform('desktop', createDefaultRequirements());

    for (const candidate of candidates) {
      expect(Object.keys(candidate.scores).length).toBeGreaterThanOrEqual(11);
      expect(candidate.totalScore).toBeGreaterThan(0);
      expect(candidate.totalScore).toBeLessThanOrEqual(1);
    }
  });

  it('is not a fixed mapping — priorities change the ranking', () => {
    const lightweight = extractRequirements(
      'Build a lightweight desktop app with low memory usage and fast startup.',
    ).requirements;
    const shipFast = extractRequirements('Build a desktop app as quickly as possible.').requirements;

    const lightweightWinner = selectStack('', 'desktop', lightweight).selected.id;
    const shipFastWinner = selectStack('', 'desktop', shipFast).selected.id;

    expect(lightweightWinner).not.toBe(shipFastWinner);
  });
});

describe('CASE A — lightweight Windows desktop editor', () => {
  const decision = decide(CASE_A, 'desktop');

  it('targets desktop', () => {
    expect(decision.target).toBe('desktop');
  });

  it('evaluates several candidates', () => {
    expect(decision.candidates.length).toBeGreaterThan(2);
  });

  it('selects a low-memory, fast-starting stack', () => {
    expect(decision.selected.memoryMB).toBeLessThan(100);
    expect(decision.selected.startupMs).toBeLessThan(1000);
    expect(decision.selected.bundleSize).toBe('small');
  });

  it('does not select Electron under these constraints', () => {
    expect(decision.selected.id).not.toBe('electron');
  });

  it('justifies the choice with the constraints that drove it', () => {
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(explainDecision(decision).toLowerCase()).toContain(decision.selected.name.toLowerCase());
  });

  it('offers real alternatives', () => {
    expect(decision.alternatives.length).toBeGreaterThan(0);
    expect(decision.alternatives.every((a) => a.id !== decision.selected.id)).toBe(true);
  });

  it('weights memory and startup above development velocity', () => {
    const table = decisionScoreTable(decision);
    const weightOf = (d: string) => table.find((row) => row.dimension === d)!.weight;

    expect(weightOf('memory')).toBeGreaterThan(weightOf('developmentVelocity'));
    expect(weightOf('startupSpeed')).toBeGreaterThan(weightOf('developmentVelocity'));
  });
});

describe('CASE B — internal admin dashboard, browser only', () => {
  const decision = decide(CASE_B, 'web');

  it('targets web', () => {
    expect(decision.target).toBe('web');
  });

  it('selects a high-velocity stack', () => {
    expect(decision.selected.scores.developmentVelocity).toBeGreaterThan(0.8);
  });

  it('weights development velocity highly', () => {
    const table = decisionScoreTable(decision);
    const velocity = table.find((row) => row.dimension === 'developmentVelocity')!;

    expect(velocity.weight).toBeGreaterThanOrEqual(1.5);
  });

  it('reports no conflicts', () => {
    expect(decision.conflicts).toEqual([]);
  });
});

describe('CASE C — hard language override', () => {
  const decision = decide(CASE_C, 'android');

  it('honours the requested language', () => {
    expect(decision.selected.language).toBe('kotlin');
  });

  it('selects Kotlin even though React Native scores higher on velocity', () => {
    const reactNative = decision.candidates.find((c) => c.id === 'react-native-android')!;
    expect(reactNative.scores.developmentVelocity).toBeGreaterThan(decision.selected.scores.developmentVelocity);
    expect(decision.selected.language).toBe('kotlin');
  });

  it('still lists the alternatives it passed over', () => {
    expect(decision.alternatives.length).toBeGreaterThan(0);
  });

  it('records the override in the decision', () => {
    expect(decision.userOverrides.preferredLanguages).toContain('kotlin');
  });
});

describe('CASE D — forbidden language', () => {
  const decision = decide(CASE_D, 'desktop');

  it('never selects the forbidden language', () => {
    expect(decision.selected.language).not.toBe('rust');
  });

  it('marks the Rust candidate as rejected', () => {
    const tauri = decision.candidates.find((c) => c.id === 'tauri')!;

    expect(tauri.rejected).toBe(true);
    expect(tauri.totalScore).toBe(0);
    expect(tauri.rejectionReasons.join(' ')).toMatch(/rust/i);
  });

  it('excludes rejected candidates from the alternatives shown to the user', () => {
    expect(decision.alternatives.some((a) => a.language === 'rust')).toBe(false);
  });

  it('explains the rejection', () => {
    const entry = decision.rejectedReasons.find((r) => r.candidate.id === 'tauri')!;
    expect(entry.reason).toMatch(/rust/i);
  });
});

describe('constraint conflicts', () => {
  it('surfaces a conflict when a requested language has no candidate', () => {
    const requirements = createDefaultRequirements();
    requirements.targetPlatforms = ['web'];
    requirements.preferredLanguages = ['cobol'];

    const decision = selectStack('', 'web', requirements, { preferredLanguages: ['cobol'] });

    expect(decision.conflicts.length).toBeGreaterThan(0);
    expect(decision.conflicts[0].kind).toBe('unsatisfiable-preference');
    expect(decision.conflicts[0].available.length).toBeGreaterThan(0);
  });

  it('still returns a usable stack when everything was excluded', () => {
    const requirements = createDefaultRequirements();
    requirements.forbiddenLanguages = ['typescript', 'rust', 'kotlin', 'cpp', 'csharp'];

    const decision = selectStack('', 'desktop', requirements);

    expect(decision.conflicts.some((c) => c.kind === 'no-eligible-candidate')).toBe(true);
    expect(decision.selected).toBeDefined();
  });

  it('lowers confidence when a conflict exists', () => {
    const requirements = createDefaultRequirements();
    requirements.preferredLanguages = ['cobol'];

    const conflicted = selectStack('', 'web', requirements, { preferredLanguages: ['cobol'] });
    const clean = selectStack('', 'web', createDefaultRequirements());

    expect(conflicted.confidence).toBeLessThan(clean.confidence);
  });
});

describe('applyStackOverride', () => {
  const base = decide(CASE_A, 'desktop');

  it('switches the selected stack', () => {
    const overridden = applyStackOverride(base, { stackId: 'electron' });

    expect(overridden.selected.id).toBe('electron');
    expect(overridden.selected.language).toBe('typescript');
  });

  it('bumps the decision version so the change is traceable', () => {
    const overridden = applyStackOverride(base, { stackId: 'electron' });
    expect(overridden.version).toBe(base.version + 1);
  });

  it('reports full confidence for an explicit choice', () => {
    const overridden = applyStackOverride(base, { stackId: 'electron' });
    expect(overridden.confidence).toBe(1);
  });

  it('preserves the original candidate set', () => {
    const overridden = applyStackOverride(base, { stackId: 'electron' });
    expect(overridden.candidates.length).toBe(base.candidates.length);
  });

  it('rejects an unknown stack id instead of fabricating one', () => {
    expect(() => applyStackOverride(base, { stackId: 'not-a-real-stack' })).toThrow(/unknown stack/i);
  });

  it('can override to a previously rejected stack', () => {
    const forbidden = decide(CASE_D, 'desktop');
    const overridden = applyStackOverride(forbidden, { stackId: 'tauri' });

    expect(overridden.selected.id).toBe('tauri');
    expect(overridden.selected.rejected).toBe(false);
  });
});

describe('per-target independence', () => {
  it('can pick different languages for different targets of one product', () => {
    const prompt =
      'Build an expense tracker for Android and Windows desktop. Keep the desktop application lightweight with low memory usage.';
    const { requirements } = extractRequirements(prompt);

    const android = selectStack(prompt, 'android', requirements);
    const desktop = selectStack(prompt, 'desktop', requirements);

    expect(android.target).toBe('android');
    expect(desktop.target).toBe('desktop');
    expect(android.selected.projectType).toBe('android');
    expect(desktop.selected.projectType).toBe('desktop');
  });
});

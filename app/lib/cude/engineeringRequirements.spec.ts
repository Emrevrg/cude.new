import { describe, expect, it } from 'vitest';
import {
  createDefaultRequirements,
  deriveUserConstraints,
  extractRequirements,
  isAtLeast,
  maxPriority,
  mergeRequirements,
  mergeUserConstraints,
  priorityRank,
  summarizeRequirements,
} from './engineeringRequirements';

/** The four deterministic prompts from the product specification. */
const CASE_A =
  'Build a very lightweight Windows desktop Markdown editor. Startup speed and low memory usage matter more than development speed.';
const CASE_B = 'Build an internal admin dashboard quickly. It only needs to run in the browser.';
const CASE_C = 'Build an Android application using Kotlin.';
const CASE_D = 'Build a desktop application but do not use Rust.';

describe('priority helpers', () => {
  it('ranks unspecified below low', () => {
    expect(priorityRank('unspecified')).toBeLessThan(priorityRank('low'));
    expect(priorityRank('high')).toBeLessThan(priorityRank('critical'));
  });

  it('isAtLeast treats unspecified as no constraint', () => {
    expect(isAtLeast('unspecified', 'high')).toBe(false);
    expect(isAtLeast('high', 'high')).toBe(true);
    expect(isAtLeast('critical', 'high')).toBe(true);
    expect(isAtLeast('low', 'high')).toBe(false);
  });

  it('maxPriority keeps the stronger signal', () => {
    expect(maxPriority('low', 'high')).toBe('high');
    expect(maxPriority('critical', 'medium')).toBe('critical');
    expect(maxPriority(undefined, 'low')).toBe('low');
  });
});

describe('defaults', () => {
  it('infers nothing without evidence', () => {
    const requirements = createDefaultRequirements();

    expect(requirements.targetPlatforms).toEqual([]);
    expect(requirements.performancePriority).toBe('unspecified');
    expect(requirements.memoryPriority).toBe('unspecified');
    expect(requirements.developmentSpeedPriority).toBe('unspecified');
    expect(requirements.offlineRequirements).toBe(false);
  });

  it('does not invent priorities from a bare platform request', () => {
    const { requirements } = extractRequirements('Build a desktop app.');

    expect(requirements.targetPlatforms).toContain('desktop');
    expect(requirements.memoryPriority).toBe('unspecified');
    expect(requirements.binarySizePriority).toBe('unspecified');
    expect(requirements.startupSpeedPriority).toBe('unspecified');
  });
});

describe('CASE A — lightweight Windows desktop editor', () => {
  const { requirements, confidence } = extractRequirements(CASE_A);

  it('detects the desktop target', () => {
    expect(requirements.targetPlatforms).toContain('desktop');
    expect(requirements.targetPlatforms).not.toContain('web');
  });

  it('raises startup speed priority', () => {
    expect(isAtLeast(requirements.startupSpeedPriority, 'high')).toBe(true);
  });

  it('raises memory priority', () => {
    expect(isAtLeast(requirements.memoryPriority, 'high')).toBe(true);
  });

  it('raises binary size priority from "lightweight"', () => {
    expect(isAtLeast(requirements.binarySizePriority, 'high')).toBe(true);
  });

  it('demotes development speed because it was explicitly traded away', () => {
    expect(requirements.developmentSpeedPriority).toBe('low');
  });

  it('reports usable confidence', () => {
    expect(confidence).toBeGreaterThan(0.4);
  });
});

describe('CASE B — internal admin dashboard, browser only', () => {
  const { requirements } = extractRequirements(CASE_B);

  it('detects the web target only', () => {
    expect(requirements.targetPlatforms).toContain('web');
    expect(requirements.targetPlatforms).not.toContain('desktop');
    expect(requirements.targetPlatforms).not.toContain('android');
  });

  it('prioritises development velocity', () => {
    expect(isAtLeast(requirements.developmentSpeedPriority, 'high')).toBe(true);
  });

  it('does not invent native desktop concerns', () => {
    expect(requirements.memoryPriority).toBe('unspecified');
    expect(requirements.binarySizePriority).toBe('unspecified');
  });

  it('records small scale for an internal tool', () => {
    expect(requirements.expectedScale).toBe('small');
  });
});

describe('CASE C — Android with an explicit language', () => {
  const { requirements } = extractRequirements(CASE_C);

  it('detects the android target', () => {
    expect(requirements.targetPlatforms).toContain('android');
  });

  it('captures Kotlin as a preferred language', () => {
    expect(requirements.preferredLanguages).toContain('kotlin');
  });

  it('does not forbid what the user asked for', () => {
    expect(requirements.forbiddenLanguages).not.toContain('kotlin');
  });

  it('promotes the mention to a hard user constraint', () => {
    const constraints = deriveUserConstraints(requirements);
    expect(constraints.preferredLanguages).toContain('kotlin');
  });
});

describe('CASE D — desktop with a forbidden language', () => {
  const { requirements } = extractRequirements(CASE_D);

  it('detects the desktop target', () => {
    expect(requirements.targetPlatforms).toContain('desktop');
  });

  it('forbids Rust', () => {
    expect(requirements.forbiddenLanguages).toContain('rust');
  });

  it('does not simultaneously prefer Rust', () => {
    expect(requirements.preferredLanguages).not.toContain('rust');
  });
});

describe('negation handling', () => {
  it.each([
    ['Build a desktop app without Electron.', 'electron'],
    ['Build a desktop app, avoid Electron.', 'electron'],
    ["Build a desktop app but don't use Electron.", 'electron'],
    ['Build a desktop app. Never use Electron.', 'electron'],
  ])('%s forbids %s', (prompt, framework) => {
    const { requirements } = extractRequirements(prompt);
    expect(requirements.forbiddenFrameworks).toContain(framework);
    expect(requirements.preferredFrameworks).not.toContain(framework);
  });

  it('treats an unnegated mention as a preference', () => {
    const { requirements } = extractRequirements('Build a desktop app using Electron.');
    expect(requirements.preferredFrameworks).toContain('electron');
    expect(requirements.forbiddenFrameworks).not.toContain('electron');
  });
});

describe('platform disambiguation', () => {
  it('does not treat an iOS prompt as Android', () => {
    const { requirements } = extractRequirements('Build an iPhone app.');
    expect(requirements.targetPlatforms).toContain('ios');
    expect(requirements.targetPlatforms).not.toContain('android');
  });

  it('treats a browser extension as an extension, not a web app', () => {
    const { requirements } = extractRequirements('Build a Chrome browser extension for bookmarks.');
    expect(requirements.targetPlatforms).toContain('browser-extension');
    expect(requirements.targetPlatforms).not.toContain('web');
  });

  it('detects multiple targets in one prompt', () => {
    const { requirements } = extractRequirements('Build an Android app and a Windows desktop app.');
    expect(requirements.targetPlatforms).toContain('android');
    expect(requirements.targetPlatforms).toContain('desktop');
  });

  it('drops the generic mobile bucket when a concrete OS is named', () => {
    const { requirements } = extractRequirements('Build a mobile app for Android.');
    expect(requirements.targetPlatforms).toContain('android');
    expect(requirements.targetPlatforms).not.toContain('mobile');
  });
});

describe('runtime and data requirements', () => {
  const prompt =
    'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. ' +
    'Expenses created on either device must synchronize. It should work offline and sync when the connection returns.';

  const { requirements } = extractRequirements(prompt);

  it('detects offline requirement', () => {
    expect(requirements.offlineRequirements).toBe(true);
  });

  it('detects synchronization requirement', () => {
    expect(requirements.synchronizationRequirements).toContain('background-sync');
  });

  it('adds conflict resolution when offline and sync are both required', () => {
    expect(requirements.synchronizationRequirements).toContain('conflict-resolution');
  });

  it('detects shared authentication', () => {
    expect(requirements.authenticationRequirements.length).toBeGreaterThan(0);
  });

  it('raises shared-code interest for multi-target products', () => {
    expect(requirements.sharedCodePriority).not.toBe('unspecified');
  });
});

describe('mergeRequirements', () => {
  it('unions list fields rather than replacing them', () => {
    const base = createDefaultRequirements();
    base.preferredLanguages = ['kotlin'];

    const merged = mergeRequirements(base, { preferredLanguages: ['typescript'] });

    expect(merged.preferredLanguages).toContain('kotlin');
    expect(merged.preferredLanguages).toContain('typescript');
  });

  it('does not mutate the base object', () => {
    const base = createDefaultRequirements();
    mergeRequirements(base, { targetPlatforms: ['web'] });
    expect(base.targetPlatforms).toEqual([]);
  });
});

describe('mergeUserConstraints', () => {
  it('is a real merge, not a no-op', () => {
    const base = createDefaultRequirements();
    const merged = mergeUserConstraints(base, { forbiddenLanguages: ['rust'] });

    expect(merged.forbiddenLanguages).toContain('rust');
    expect(base.forbiddenLanguages).toEqual([]);
  });

  it('lets a prohibition win over a preference for the same technology', () => {
    const base = createDefaultRequirements();
    base.preferredLanguages = ['rust'];

    const merged = mergeUserConstraints(base, { forbiddenLanguages: ['rust'] });

    expect(merged.preferredLanguages).not.toContain('rust');
    expect(merged.forbiddenLanguages).toContain('rust');
  });

  it('turns a memory budget into a memory priority', () => {
    const merged = mergeUserConstraints(createDefaultRequirements(), {
      performanceBudget: { maxMemoryMB: 64 },
    });

    expect(isAtLeast(merged.memoryPriority, 'high')).toBe(true);
    expect(merged.customConstraints.maxMemoryMB).toBe(64);
  });

  it('removes forbidden platforms', () => {
    const base = createDefaultRequirements();
    base.targetPlatforms = ['web', 'desktop'];

    const merged = mergeUserConstraints(base, { forbiddenPlatforms: ['desktop'] });

    expect(merged.targetPlatforms).toEqual(['web']);
  });
});

describe('summarizeRequirements', () => {
  it('omits unspecified priorities', () => {
    const summary = summarizeRequirements(createDefaultRequirements());
    expect(summary).toEqual([]);
  });

  it('reports the constraints that were actually set', () => {
    const { requirements } = extractRequirements(CASE_D);
    const summary = summarizeRequirements(requirements);

    expect(summary.some((line) => line.includes('rust'))).toBe(true);
  });
});

describe('responsive web platform detection', () => {
  it('does not turn desktop and mobile layouts into a native desktop app', () => {
    const { requirements } = extractRequirements(
      'Build an e-commerce web platform with responsive desktop and mobile layouts.',
    );
    expect(requirements.targetPlatforms).toEqual(['web']);
  });
  it('still recognizes an explicit desktop application', () => {
    expect(extractRequirements('Build a desktop application with Electron').requirements.targetPlatforms).toContain(
      'desktop',
    );
  });
});

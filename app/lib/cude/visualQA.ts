/**
 * Cude.new - Visual QA: real rendered/static consistency analysis
 * Checks token consumption, component reuse, spacing/radius drift, platform conventions, a11y.
 */
import type { DesignSystem } from './designSystem';

export interface VisualIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category:
    | 'color'
    | 'typography'
    | 'spacing'
    | 'radius'
    | 'shadow'
    | 'component'
    | 'reuse'
    | 'responsive'
    | 'a11y'
    | 'platform'
    | 'overflow'
    | 'density';
  file: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface VisualQAReport {
  passed: boolean;
  issues: VisualIssue[];
  screens: string[];
  metrics: { componentsReused: number; tokensUsed: number; uniqueRadii: string[]; uniqueSpacings: string[] };
}

export function runVisualQA(files: Record<string, string>, ds: DesignSystem | null, screens: string[]): VisualQAReport {
  const issues: VisualIssue[] = [];

  // 1. Token consumption: every screen should reference CSS vars or theme, not hardcoded arbitrary colors/spacings without token
  const tokenVars = ds
    ? Object.keys(ds.colors).map((k) => `--color-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`)
    : [];

  // Check screens contain var(--color- or var(--space- or import design-system
  for (const screen of screens) {
    const rel =
      `src/screens/${screen}.tsx` in files
        ? `src/screens/${screen}.tsx`
        : `src/${screen}.tsx` in files
          ? `src/${screen}.tsx`
          : `src/App.tsx`;
    const content = files[rel] ?? files[`src/screens/${screen}.tsx`] ?? '';

    if (content && ds) {
      const usesTokens =
        /var\(--color-|var\(--space-|var\(--radius-|from ['"]\.\.?\/.*design-system/.test(content) ||
        content.includes('designSystem');

      if (!usesTokens) {
        issues.push({
          id: `token-${screen}`,
          severity: 'warning',
          category: 'color',
          file: rel,
          message: `Screen ${screen} does not consume design tokens (no var(--color-*/--space- or design-system import)`,
        });
      }
    }
  }

  /*
   * 2. Radius drift.
   *
   * Drift is a radius written as a literal at a usage site. The token file that
   * *defines* the scale is not drift — counting those definitions flagged every
   * correct project, which turned this check into noise nobody could act on.
   */
  const hardcodedRadii = new Set<string>();
  const definedRadii = new Set<string>();

  for (const [filePath, content] of Object.entries(files)) {
    if (!/\.(tsx|jsx|css|scss)$/.test(filePath)) {
      continue;
    }

    for (const match of content.matchAll(/--radius-[\w-]+:\s*([^;]+);/g)) {
      definedRadii.add(match[1].trim());
    }

    // Usage sites, in CSS and in inline styles. `var(...)` is the system working.
    for (const match of content.matchAll(/border-radius:\s*([^;]+);/g)) {
      const value = match[1].trim();

      if (!value.startsWith('var(')) {
        hardcodedRadii.add(value);
      }
    }

    for (const match of content.matchAll(/borderRadius:\s*['"]([^'"]+)['"]/g)) {
      const value = match[1].trim();

      if (!value.startsWith('var(')) {
        hardcodedRadii.add(value);
      }
    }
  }

  const radii = hardcodedRadii;

  if (hardcodedRadii.size > 0) {
    issues.push({
      id: 'radius-drift',
      severity: 'warning',
      category: 'radius',
      file: 'design-system',
      message: `Radius drift: ${hardcodedRadii.size} hardcoded ${
        hardcodedRadii.size === 1 ? 'radius' : 'radii'
      } (${Array.from(hardcodedRadii).slice(0, 5).join(', ')}) — expected var(--radius-*)`,
      expected: 'var(--radius-*)',
      actual: Array.from(hardcodedRadii).join(', '),
    });
  }

  /*
   * A scale with too many steps is its own problem: every extra radius is one
   * more decision at every usage site.
   */
  if (definedRadii.size > 6) {
    issues.push({
      id: 'radius-scale',
      severity: 'warning',
      category: 'radius',
      file: 'design-system',
      message: `The radius scale defines ${definedRadii.size} steps — more than a reader can hold`,
      expected: 'at most 6 steps',
      actual: Array.from(definedRadii).join(', '),
    });
  }

  // 3. Spacing drift
  const spacings = new Set<string>();

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx|jsx|css)$/.test(path)) {
      continue;
    }

    const m = content.match(/padding:\s*([^;]+);/g);

    if (m) {
      m.forEach((v) => spacings.add(v.trim()));
    }
  }

  // not strict, just metrics

  // 4. Component reuse: detect duplicated Button implementations
  const buttonFiles = Object.keys(files).filter((p) => p.toLowerCase().includes('button'));

  if (buttonFiles.length > 3) {
    // heuristic: many button files likely duplication
    issues.push({
      id: 'reuse-button',
      severity: 'warning',
      category: 'reuse',
      file: buttonFiles.join(', '),
      message: `Possible duplicated button primitives: ${buttonFiles.length} button files (${buttonFiles.slice(0, 3).join(', ')}) — should reuse shared Button`,
    });
  }

  // Check screens import shared Button
  for (const screen of screens) {
    const content = files[`src/screens/${screen}.tsx`] ?? files[`src/${screen}.tsx`] ?? files['src/App.tsx'] ?? '';

    if (!content) {
      continue;
    }

    /*
     * A raw `<button>` is lowercase; `<Button>` is the shared primitive. The
     * check used to match case-insensitively, so a screen doing exactly the
     * right thing was reported as doing the wrong one.
     */
    const usesRawButton = /<button[\s/>]/.test(content);

    // Any local import that brings in a Button counts as reuse.
    const importsButton = /import\s*\{[^}]*Button[^}]*\}\s*from\s*['"]\.[^'"]*['"]/.test(content);

    if (usesRawButton && !importsButton) {
      issues.push({
        id: `reuse-${screen}`,
        severity: 'info',
        category: 'reuse',
        file: `src/screens/${screen}.tsx`,
        message: `Screen ${screen} uses raw <button> without the shared Button primitive`,
      });
    }
  }

  // 5. Platform-aware: check touch targets for mobile
  if (ds?.platform?.android) {
    // ensure button height >= 44px for mobile
    const btnHeight = ds.components.button.height;
    const h = parseInt(btnHeight);

    if (h < 44) {
      issues.push({
        id: 'platform-touch',
        severity: 'info',
        category: 'platform',
        file: 'design-system',
        message: `Button height ${btnHeight} below recommended 48px touch target for Android`,
      });
    }
  }

  // 6. A11y: check contrast (simple: background vs text not same)
  if (ds) {
    if (ds.colors.background.toLowerCase() === ds.colors.textPrimary.toLowerCase()) {
      issues.push({
        id: 'a11y-contrast',
        severity: 'error',
        category: 'a11y',
        file: 'design-system',
        message: 'Background and textPrimary are identical — insufficient contrast',
      });
    }
  }

  // 7. Overflow/clipping heuristic: look for fixed widths >100vw or missing responsive
  for (const [path, content] of Object.entries(files)) {
    if (/width:\s*\d{3,4}px/.test(content) && !/max-width/.test(content)) {
      issues.push({
        id: `overflow-${path}`,
        severity: 'info',
        category: 'overflow',
        file: path,
        message: 'Fixed width without max-width may cause horizontal overflow on mobile',
      });
    }
  }

  const passed = issues.filter((i) => i.severity === 'error').length === 0;

  return {
    passed,
    issues,
    screens,
    metrics: {
      componentsReused: buttonFiles.length,
      tokensUsed: tokenVars.length,
      uniqueRadii: Array.from(radii),
      uniqueSpacings: Array.from(spacings),
    },
  };
}

export function categorizeRepairs(report: VisualQAReport): { systemic: VisualIssue[]; perScreen: VisualIssue[] } {
  const systemic = report.issues.filter((i) => ['radius', 'spacing', 'color', 'reuse'].includes(i.category));
  const perScreen = report.issues.filter((i) => !systemic.includes(i));

  return { systemic, perScreen };
}

/*
 * ------------------------------------------------------------------ *
 * Composition / density analysis
 * ------------------------------------------------------------------
 */

/**
 * Codes for poor use of available space.
 *
 * These are deliberately not "count the white pixels". Whitespace is often
 * intentional; accidental emptiness is what we want to catch, so the analysis
 * works from the surface's declared regions — how much of the surface carries
 * information, how it is distributed, and whether the platform's own norms are
 * being met.
 */
export type CompositionCode = 'LOW_INFORMATION_DENSITY' | 'UNBALANCED_LAYOUT' | 'EXCESSIVE_EMPTY_SPACE';

export interface CompositionFinding {
  code: CompositionCode;
  severity: 'error' | 'warning' | 'info';
  platform: string;
  surface: string;
  message: string;

  /** The measurement that triggered it, so the finding is checkable. */
  measured: string;
}

/**
 * Minimum information a surface should carry, per platform.
 *
 * Small surfaces have *higher* expectations here, not lower: a 400px popup that
 * shows one button is the failure mode this exists to catch.
 */
const MIN_ITEMS_PER_SURFACE: Record<string, number> = {
  'browser-extension': 8,
  'vscode-extension': 10,
  'ide-extension': 10,
  desktop: 14,
  web: 10,
  fullstack: 10,
  pwa: 10,
  android: 8,
  ios: 8,
  mobile: 8,
};

/** Share of a surface a single region may occupy before it looks unbalanced. */
const MAX_SINGLE_REGION_WEIGHT = 0.75;

/**
 * Analyses the composition of the surfaces in a design contract.
 *
 * Runs against the approved contract, so Visual QA and the Builder are judging
 * the same thing the user approved.
 */
export function analyzeComposition(contract: {
  platformDesigns: Record<
    string,
    {
      platform: string;
      density: string;
      surfaces: Array<{
        id: string;
        name: string;
        isPrimary?: boolean;
        regions: Array<{ role: string; weight: number; items: number }>;
      }>;
    }
  >;
}): CompositionFinding[] {
  const findings: CompositionFinding[] = [];

  for (const design of Object.values(contract.platformDesigns)) {
    const minItems = MIN_ITEMS_PER_SURFACE[design.platform] ?? 8;

    for (const surface of design.surfaces) {
      /*
       * Secondary surfaces — a dialog, a settings pane — are legitimately
       * smaller than the primary workspace, so they are held to a lower floor.
       * The check exists to catch an empty *main* surface, not to demand that
       * every modal carry a table.
       */
      const isPrimary = surface.isPrimary !== false;
      const floor = isPrimary ? minItems : Math.ceil(minItems * 0.6);

      const totalItems = surface.regions.reduce((sum, r) => sum + r.items, 0);
      const coverage = surface.regions.reduce((sum, r) => sum + r.weight, 0);
      const contentRegions = surface.regions.filter(
        (r) => r.role !== 'header' && r.role !== 'footer' && r.role !== 'navigation',
      );
      const contentWeight = contentRegions.reduce((sum, r) => sum + r.weight, 0);

      if (totalItems < floor) {
        findings.push({
          code: 'LOW_INFORMATION_DENSITY',
          severity: 'warning',
          platform: design.platform,
          surface: surface.name,
          message: `${surface.name} carries ${totalItems} information items; ${design.platform} ${
            isPrimary ? 'primary' : 'secondary'
          } surfaces should carry at least ${floor}.`,
          measured: `items=${totalItems} min=${floor} primary=${isPrimary}`,
        });
      }

      /*
       * Declared regions covering well under the surface means the rest is
       * unaccounted-for space rather than deliberate breathing room.
       */
      if (coverage < 0.75) {
        findings.push({
          code: 'EXCESSIVE_EMPTY_SPACE',
          severity: 'warning',
          platform: design.platform,
          surface: surface.name,
          message: `Regions account for only ${Math.round(coverage * 100)}% of ${surface.name}; the remainder is unassigned.`,
          measured: `coverage=${coverage.toFixed(2)}`,
        });
      }

      // Chrome without content: a surface that is mostly header/nav/footer.
      if (contentRegions.length > 0 && contentWeight < 0.4) {
        findings.push({
          code: 'UNBALANCED_LAYOUT',
          severity: 'warning',
          platform: design.platform,
          surface: surface.name,
          message: `${surface.name} devotes only ${Math.round(contentWeight * 100)}% to content; the rest is navigation and chrome.`,
          measured: `contentWeight=${contentWeight.toFixed(2)}`,
        });
      }

      const dominant = surface.regions.find((r) => r.weight > MAX_SINGLE_REGION_WEIGHT);

      if (dominant && surface.regions.length > 1) {
        findings.push({
          code: 'UNBALANCED_LAYOUT',
          severity: 'info',
          platform: design.platform,
          surface: surface.name,
          message: `A single region occupies ${Math.round(dominant.weight * 100)}% of ${surface.name}.`,
          measured: `role=${dominant.role} weight=${dominant.weight.toFixed(2)}`,
        });
      }
    }
  }

  return findings;
}

/** True when nothing worse than `info` was found. */
export function compositionPassed(findings: CompositionFinding[]): boolean {
  return !findings.some((f) => f.severity === 'error' || f.severity === 'warning');
}

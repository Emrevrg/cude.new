/**
 * Cude.new - Design Contract
 *
 * The artefact the user actually approves before the Builder spends effort.
 *
 * It is derived from the existing architecture (requirements, stack decisions,
 * product graph) and the existing Design System — it does not introduce a second
 * design system. What it adds is the *interface architecture*: which surfaces a
 * product has on each platform, how they are laid out, how dense they should be,
 * and which navigation model belongs on that platform.
 *
 * Builder consumes the approved contract. Visual QA compares the implementation
 * against it. Repair fixes meaningful divergence.
 */

import type { ProjectType } from './platform';
import type { DesignSystem } from './designSystem';
import type { EngineeringRequirements } from './engineeringRequirements';
import { getPlatformProfile, type NavigationPattern } from './platformAdaptation';

/**
 * Information density. Distinct from the Design System's own `density` token,
 * which describes spacing character; this describes how much information a
 * surface should carry per screen.
 */
export type DensityLevel = 'comfortable' | 'balanced' | 'compact' | 'dense';

export const DENSITY_LEVELS: DensityLevel[] = ['comfortable', 'balanced', 'compact', 'dense'];

export type DesignApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved';

/** What a region of a surface is for. Drives both preview and Visual QA. */
export type RegionRole =
  | 'header'
  | 'navigation'
  | 'primary-action'
  | 'status'
  | 'list'
  | 'detail'
  | 'metrics'
  | 'form'
  | 'toolbar'
  | 'tree'
  | 'editor'
  | 'footer'
  | 'settings';

export interface SurfaceRegion {
  id: string;
  role: RegionRole;
  label: string;

  /** Rough share of the surface this region occupies, 0-1. Used by density QA. */
  weight: number;

  /** Number of distinct information items this region is expected to carry. */
  items: number;
  description?: string;
}

/** One screen, panel or view of the product on a given platform. */
export interface DesignSurface {
  id: string;
  name: string;

  /** Why this surface exists — shown in the review. */
  purpose: string;

  /** Ordered top-to-bottom (or primary-to-secondary) regions. */
  regions: SurfaceRegion[];
  isPrimary: boolean;
}

export type DecorationLevel = 'standard' | 'reduced' | 'minimal';

export const DECORATION_LEVELS: DecorationLevel[] = ['standard', 'reduced', 'minimal'];

export interface PlatformDesign {
  platform: ProjectType;
  navigation: NavigationPattern;
  density: DensityLevel;

  /** How much non-essential visual treatment the surfaces carry. */
  decoration: DecorationLevel;

  /** Minimum interactive target in CSS pixels. */
  touchTargetMin: number;

  /** Intended viewport the preview renders at. */
  viewport: { width: number; height: number };
  surfaces: DesignSurface[];

  /** Short, user-facing notes on what is platform-specific here. */
  adaptationNotes: string[];

  /** Interaction model, e.g. 'touch', 'keyboard', 'mixed'. */
  inputModel: string;
}

export interface ComponentRule {
  component: string;
  rule: string;
}

export interface DesignContract {
  schemaVersion: number;
  productId: string;
  productName: string;
  status: DesignApprovalStatus;

  /** Increments on every revision request. */
  revision: number;

  /** Platforms covered by this contract. */
  platforms: ProjectType[];

  /** Per-platform interface architecture. */
  platformDesigns: Record<string, PlatformDesign>;

  /** The shared identity every platform inherits. Not duplicated — referenced. */
  designSystem: DesignSystem;
  componentRules: ComponentRule[];
  responsiveRules: string[];

  /** Free-text revision requests the user made, newest last. */
  revisionNotes: string[];
  createdAt: string;
  approvedAt?: string;
}

export const DESIGN_CONTRACT_SCHEMA_VERSION = 1;

/*
 * ------------------------------------------------------------------ *
 * Approval applicability
 * ------------------------------------------------------------------
 */

/** Platforms that present no user interface worth approving. */
const HEADLESS_PLATFORMS: ReadonlySet<ProjectType> = new Set<ProjectType>(['backend']);

/**
 * True when at least one target has a meaningful interface.
 *
 * A pure backend or CLI product must not be forced through a visual approval
 * step — that would make the workflow annoying for exactly the projects it
 * cannot help.
 */
export function requiresDesignApproval(platforms: ProjectType[]): boolean {
  return platforms.some((platform) => !HEADLESS_PLATFORMS.has(platform));
}

/** The subset of targets that actually need a design proposal. */
export function surfaceBearingPlatforms(platforms: ProjectType[]): ProjectType[] {
  return platforms.filter((platform) => !HEADLESS_PLATFORMS.has(platform));
}

/*
 * ------------------------------------------------------------------ *
 * Density intelligence
 * ------------------------------------------------------------------
 */

/** Baseline density per platform, before requirement-driven adjustment. */
const PLATFORM_BASE_DENSITY: Partial<Record<ProjectType, DensityLevel>> = {
  web: 'balanced',
  fullstack: 'balanced',
  pwa: 'balanced',
  android: 'balanced',
  ios: 'balanced',
  mobile: 'balanced',
  desktop: 'compact',
  'browser-extension': 'compact',
  'vscode-extension': 'dense',
  'ide-extension': 'dense',
};

function shiftDensity(level: DensityLevel, steps: number): DensityLevel {
  const index = DENSITY_LEVELS.indexOf(level);
  return DENSITY_LEVELS[Math.max(0, Math.min(DENSITY_LEVELS.length - 1, index + steps))];
}

function shiftDecoration(level: DecorationLevel, steps: number): DecorationLevel {
  const index = DECORATION_LEVELS.indexOf(level);
  return DECORATION_LEVELS[Math.max(0, Math.min(DECORATION_LEVELS.length - 1, index + steps))];
}

/**
 * Chooses an information density for a platform.
 *
 * Platform sets the baseline; the brief moves it. A marketing page and an admin
 * console are both "web" but should not look the same, so the amount of data,
 * the interaction frequency and any explicit request all shift the result.
 */
export function resolveDensity(
  platform: ProjectType,
  requirements: EngineeringRequirements,
  prompt = '',
): DensityLevel {
  let density = PLATFORM_BASE_DENSITY[platform] ?? 'balanced';
  const text = `${prompt} ${requirements.customConstraints?.designNotes ?? ''}`.toLowerCase();

  // Explicit user language wins.
  if (/\b(dense|denser|compact|tighter|information[- ]dense|pack more)\b/.test(text)) {
    density = shiftDensity(density, 1);
  }

  if (/\b(spacious|airy|roomy|comfortable|more breathing room|less dense)\b/.test(text)) {
    density = shiftDensity(density, -1);
  }

  // Marketing surfaces breathe; data surfaces do not.
  if (/\b(landing page|marketing|brochure|portfolio|homepage)\b/.test(text)) {
    density = shiftDensity(density, -1);
  }

  if (/\b(dashboard|admin|analytics|console|monitoring|table|report|developer tool)\b/.test(text)) {
    density = shiftDensity(density, 1);
  }

  // A product carrying lots of records needs to show lots of records.
  const dataWeight =
    requirements.databaseRequirements.length +
    requirements.synchronizationRequirements.length +
    (requirements.realtimeRequirements ? 1 : 0);

  if (dataWeight >= 3) {
    density = shiftDensity(density, 1);
  }

  return density;
}

/*
 * ------------------------------------------------------------------ *
 * Surface planning
 * ------------------------------------------------------------------
 */

function region(
  id: string,
  role: RegionRole,
  label: string,
  weight: number,
  items: number,
  description?: string,
): SurfaceRegion {
  return { id, role, label, weight, items, description };
}

/** Domain nouns pulled from the brief, used to label surfaces honestly. */
function primaryNoun(requirements: EngineeringRequirements, prompt: string): string {
  const match =
    /\b(expense|task|note|habit|invoice|order|contact|project|issue|bookmark|summar|transaction|message)\w*/i.exec(
      prompt,
    );

  if (match) {
    const word = match[0].toLowerCase().replace(/s$/, '');
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  return requirements.databaseRequirements.length > 0 ? 'Record' : 'Item';
}

/**
 * Plans the surfaces for one platform.
 *
 * This is where "do not produce the same generic dashboard for every platform"
 * is actually enforced: each platform gets an interface architecture drawn from
 * its own conventions, not a shared template.
 */
export function planSurfaces(
  platform: ProjectType,
  requirements: EngineeringRequirements,
  prompt: string,
): DesignSurface[] {
  const noun = primaryNoun(requirements, prompt);
  const hasAuth = requirements.authenticationRequirements.length > 0;
  const hasSync = requirements.synchronizationRequirements.length > 0;

  switch (platform) {
    /* ---------- Browser extension: a small surface used deliberately ---------- */
    case 'browser-extension':
      return [
        {
          id: 'popup',
          name: 'Popup',
          purpose: 'The single click-target surface. Must be immediately useful without scrolling.',
          isPrimary: true,
          regions: [
            region('header', 'header', 'Compact header', 0.08, 2, 'Product mark and settings affordance'),
            region('status', 'status', 'Current page context', 0.12, 2, 'What the extension is acting on right now'),
            region('action', 'primary-action', 'Primary action', 0.1, 1, `Run ${noun.toLowerCase()} for this page`),
            region('result', 'detail', 'Result', 0.38, 3, 'The output, with copy affordance'),
            region('recent', 'list', 'Recent activity', 0.24, 4, `Last ${noun.toLowerCase()}s, one line each`),
            region('footer', 'footer', 'Footer controls', 0.08, 2, 'Settings and account access'),
          ],
        },
        {
          id: 'options',
          name: 'Settings',
          purpose: 'Full-page options, opened from the popup footer.',
          isPrimary: false,
          regions: [
            region('header', 'header', 'Header', 0.1, 1),
            region('form', 'form', 'Preferences', 0.6, 6, 'Grouped settings with inline descriptions'),
            region('about', 'settings', 'About & data', 0.3, 3),
          ],
        },
      ];

    /* ---------- VS Code extension: native editor idioms ---------- */
    case 'vscode-extension':
    case 'ide-extension':
      return [
        {
          id: 'sidebar',
          name: 'Side Bar View',
          purpose: 'The extension’s primary view in the Side Bar. Tree-first, not a dashboard.',
          isPrimary: true,
          regions: [
            region('toolbar', 'toolbar', 'View toolbar', 0.07, 3, 'Refresh, filter, collapse — icon-only'),
            region('tree', 'tree', 'Grouped results', 0.68, 12, 'Severity groups with expandable children'),
            region('status', 'status', 'View status', 0.1, 2, 'Counts and last-run time'),
            region('actions', 'primary-action', 'Contextual actions', 0.15, 3, 'Apply fix, ignore, reveal in editor'),
          ],
        },
        {
          id: 'panel',
          name: 'Panel',
          purpose: 'Detail output in the bottom Panel, next to Terminal and Problems.',
          isPrimary: false,
          regions: [
            region('toolbar', 'toolbar', 'Panel toolbar', 0.08, 3),
            region('detail', 'detail', 'Detail output', 0.72, 8, 'Selected item with code context'),
            region('actions', 'primary-action', 'Actions', 0.2, 2),
          ],
        },
        {
          id: 'settings',
          name: 'Configuration',
          purpose: 'Contributed settings, rendered by VS Code’s own settings UI.',
          isPrimary: false,
          regions: [
            region(
              'form',
              'form',
              'Contributed settings',
              0.8,
              6,
              'Declared in package.json contributes.configuration',
            ),
            region('commands', 'settings', 'Commands & keybindings', 0.2, 4),
          ],
        },
      ];

    /* ---------- Android: touch-first, bottom navigation ---------- */
    case 'android':
    case 'ios':
    case 'mobile':
      return [
        {
          id: 'home',
          name: 'Home',
          purpose: `The ${noun.toLowerCase()} list, reachable in one tap from anywhere.`,
          isPrimary: true,
          regions: [
            region('appbar', 'header', 'App bar', 0.09, 2),
            region('summary', 'metrics', 'Summary', 0.16, 3, 'This period at a glance'),
            region('list', 'list', `${noun} list`, 0.55, 8, 'Grouped by date, swipe actions'),
            region('fab', 'primary-action', `Add ${noun.toLowerCase()}`, 0.06, 1, 'Floating action button'),
            region('nav', 'navigation', 'Bottom navigation', 0.14, 3),
          ],
        },
        {
          id: 'detail',
          name: `${noun} detail`,
          purpose: `View and edit a single ${noun.toLowerCase()}.`,
          isPrimary: false,
          regions: [
            region('appbar', 'header', 'App bar with back', 0.09, 2),
            region('detail', 'detail', 'Fields', 0.6, 6),
            region('actions', 'primary-action', 'Save / delete', 0.17, 2),
            region('nav', 'navigation', 'Bottom navigation', 0.14, 3),
          ],
        },
        {
          id: 'profile',
          name: 'Account',
          purpose: hasAuth ? 'Account, sync status and preferences.' : 'Preferences.',
          isPrimary: false,
          regions: [
            region('appbar', 'header', 'App bar', 0.09, 2),
            region('account', 'status', 'Account & sync', 0.24, hasSync ? 4 : 2),
            region('form', 'form', 'Preferences', 0.53, 5),
            region('nav', 'navigation', 'Bottom navigation', 0.14, 3),
          ],
        },
      ];

    /* ---------- Desktop: multi-pane, keyboard-oriented ---------- */
    case 'desktop':
      return [
        {
          id: 'workspace',
          name: 'Main workspace',
          purpose: 'Multi-pane workspace: navigate, list and inspect without changing screens.',
          isPrimary: true,
          regions: [
            region('sidebar', 'navigation', 'Sidebar', 0.16, 6, 'Sections and saved views'),
            region('toolbar', 'toolbar', 'Toolbar', 0.07, 5, 'Search, filters, keyboard shortcuts'),
            region('list', 'list', `${noun} table`, 0.45, 14, 'Dense rows, sortable columns'),
            region('detail', 'detail', 'Inspector', 0.24, 8, 'Selected record, edited in place'),
            region('status', 'status', 'Status bar', 0.08, 3, hasSync ? 'Sync state and counts' : 'Counts'),
          ],
        },
        {
          id: 'dialog',
          name: 'Secondary dialog',
          purpose: `Create or edit a ${noun.toLowerCase()} without leaving the workspace.`,
          isPrimary: false,
          regions: [
            region('header', 'header', 'Dialog header', 0.12, 1),
            region('form', 'form', 'Form', 0.66, 6),
            region('actions', 'primary-action', 'Confirm / cancel', 0.22, 2),
          ],
        },
        {
          id: 'settings',
          name: 'Settings',
          purpose: 'Application preferences, account and data.',
          isPrimary: false,
          regions: [
            region('nav', 'navigation', 'Settings sections', 0.22, 5),
            region('form', 'form', 'Section content', 0.6, 7),
            region('actions', 'primary-action', 'Apply', 0.18, 2),
          ],
        },
      ];

    /* ---------- Web (and PWA / fullstack): responsive ---------- */
    default:
      return [
        {
          id: 'dashboard',
          name: 'Dashboard',
          purpose: 'The landing surface after sign-in: current state at a glance.',
          isPrimary: true,
          regions: [
            region('nav', 'navigation', 'Sidebar navigation', 0.15, 6),
            region('header', 'header', 'Page header', 0.08, 3, 'Title, period selector, primary action'),
            region('metrics', 'metrics', 'Key metrics', 0.18, 4),
            region('list', 'list', `Recent ${noun.toLowerCase()}s`, 0.44, 10),
            region('footer', 'footer', 'Footer', 0.05, 2),
          ],
        },
        {
          id: 'detail',
          name: `${noun} detail`,
          purpose: `Inspect and edit a single ${noun.toLowerCase()}.`,
          isPrimary: false,
          regions: [
            region('nav', 'navigation', 'Sidebar navigation', 0.15, 6),
            region('header', 'header', 'Breadcrumb & actions', 0.1, 3),
            region('detail', 'detail', 'Fields', 0.5, 8),
            region('meta', 'status', 'Activity & metadata', 0.25, 5),
          ],
        },
        {
          id: 'settings',
          name: 'Settings',
          purpose: 'Account, preferences and data management.',
          isPrimary: false,
          regions: [
            region('nav', 'navigation', 'Sidebar navigation', 0.15, 6),
            region('sections', 'settings', 'Settings sections', 0.2, 5),
            region('form', 'form', 'Section content', 0.65, 7),
          ],
        },
      ];
  }
}

/** Intended preview viewport per platform. */
function viewportFor(platform: ProjectType): { width: number; height: number } {
  switch (platform) {
    case 'browser-extension':
      return { width: 400, height: 600 };
    case 'vscode-extension':
    case 'ide-extension':
      return { width: 360, height: 640 };
    case 'android':
    case 'ios':
    case 'mobile':
      return { width: 390, height: 780 };
    case 'desktop':
      return { width: 1280, height: 800 };
    default:
      return { width: 1280, height: 800 };
  }
}

/** Short, user-facing notes about what is platform-specific. */
function adaptationNotesFor(platform: ProjectType, density: DensityLevel, navigation: NavigationPattern): string[] {
  const notes: string[] = [`${navigation} navigation`, `${density} information density`];

  switch (platform) {
    case 'browser-extension':
      notes.push('Fixed 400px popup — every region must earn its space');
      notes.push('No desktop navigation patterns; settings open in a separate page');
      break;
    case 'vscode-extension':
    case 'ide-extension':
      notes.push('Side Bar tree view, not a standalone dashboard');
      notes.push('Uses the editor’s own theme tokens and contributed settings UI');
      break;
    case 'android':
    case 'ios':
    case 'mobile':
      notes.push('Touch-first with a floating primary action');
      notes.push('One primary task per screen');
      break;
    case 'desktop':
      notes.push('Multi-pane: navigate, list and inspect simultaneously');
      notes.push('Keyboard shortcuts and a persistent status bar');
      break;
    default:
      notes.push('Responsive: sidebar collapses to a top bar on narrow viewports');
      break;
  }

  return notes;
}

/*
 * ------------------------------------------------------------------ *
 * Contract construction
 * ------------------------------------------------------------------
 */

export interface CreateDesignContractInput {
  productId: string;
  productName: string;
  prompt: string;
  platforms: ProjectType[];
  requirements: EngineeringRequirements;
  designSystem: DesignSystem;
}

/** Builds the per-platform design for a single target. */
export function createPlatformDesign(
  platform: ProjectType,
  requirements: EngineeringRequirements,
  prompt: string,
): PlatformDesign {
  const profile = getPlatformProfile(platform);
  const density = resolveDensity(platform, requirements, prompt);

  return {
    platform,
    navigation: profile.primaryNavigation,
    density,
    decoration: 'standard',
    touchTargetMin: profile.touchTargetMin,
    viewport: viewportFor(platform),
    surfaces: planSurfaces(platform, requirements, prompt),
    adaptationNotes: adaptationNotesFor(platform, density, profile.primaryNavigation),
    inputModel: profile.inputMethod,
  };
}

/** Component conventions that apply across every surface. */
function componentRulesFor(designSystem: DesignSystem, densities: DensityLevel[]): ComponentRule[] {
  const tightest = densities.includes('dense') ? 'dense' : densities.includes('compact') ? 'compact' : 'balanced';

  return [
    { component: 'Button', rule: `Height ${designSystem.components.button.height}; radius ${designSystem.radius.md}` },
    { component: 'Card', rule: `Padding ${designSystem.components.card.padding}; used for grouping, not decoration` },
    { component: 'List row', rule: `Single-line where possible at ${tightest} density; no nested cards` },
    {
      component: 'Typography',
      rule: `${designSystem.typography.fontFamily.split(',')[0]}; body ${designSystem.typography.body.size}`,
    },
    { component: 'Colour', rule: 'Semantic tokens only — no ad-hoc hex values in generated components' },
    { component: 'Elevation', rule: 'Borders before shadows; shadows reserved for overlays' },
  ];
}

export function createDesignContract(input: CreateDesignContractInput): DesignContract {
  const platforms = surfaceBearingPlatforms(input.platforms);

  const platformDesigns: Record<string, PlatformDesign> = {};

  for (const platform of platforms) {
    platformDesigns[platform] = createPlatformDesign(platform, input.requirements, input.prompt);
  }

  const densities = Object.values(platformDesigns).map((d) => d.density);

  return {
    schemaVersion: DESIGN_CONTRACT_SCHEMA_VERSION,
    productId: input.productId,
    productName: input.productName,
    status: 'in_review',
    revision: 1,
    platforms,
    platformDesigns,
    designSystem: input.designSystem,
    componentRules: componentRulesFor(input.designSystem, densities),
    responsiveRules: [
      'Sidebar navigation collapses below 1024px',
      'Tables become stacked rows below 768px',
      'Touch targets never below the platform minimum',
    ],
    revisionNotes: [],
    createdAt: new Date().toISOString(),
  };
}

/*
 * ------------------------------------------------------------------ *
 * Approval lifecycle
 * ------------------------------------------------------------------
 */

/** Marks the contract approved. Only the user may cause this to happen. */
export function approveDesignContract(contract: DesignContract): DesignContract {
  return {
    ...contract,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Applies a revision request.
 *
 * Requirements, architecture and the product graph are untouched — only the
 * design changes, and the contract stays unapproved so the Builder remains
 * paused. Optionally scoped to one platform, which is what the add-target flow
 * needs so revising Desktop never disturbs an approved Android design.
 */
export function reviseDesignContract(
  contract: DesignContract,
  feedback: string,
  options: { platform?: ProjectType } = {},
): DesignContract {
  const scope = options.platform ? [options.platform] : contract.platforms;
  const platformDesigns = { ...contract.platformDesigns };

  for (const platform of scope) {
    const current = platformDesigns[platform];

    if (!current) {
      continue;
    }

    platformDesigns[platform] = applyFeedbackToPlatformDesign(current, feedback);
  }

  return {
    ...contract,
    status: 'changes_requested',
    revision: contract.revision + 1,
    platformDesigns,
    revisionNotes: [...contract.revisionNotes, feedback],
    approvedAt: undefined,
  };
}

/**
 * Translates plain-language feedback into concrete design changes.
 *
 * Deliberately conservative: it adjusts density, decoration and structure, and
 * records anything it could not act on so the review surface can say so rather
 * than silently ignoring the request.
 */
export function applyFeedbackToPlatformDesign(design: PlatformDesign, feedback: string): PlatformDesign {
  const text = feedback.toLowerCase();
  let density = design.density;
  let decoration = design.decoration;
  const notes = [...design.adaptationNotes];

  const wantsDenser =
    /\b(dense|denser|compact|tighter|condense|more information|reduce (?:the )?(?:padding|whitespace))\b/.test(text);
  const wantsAirier = /\b(spacious|airy|roomier|comfortable|more (?:space|breathing))\b/.test(text);

  if (wantsDenser) {
    const next = shiftDensity(density, 1);

    if (next === density) {
      /*
       * Already at the densest level. Say so rather than silently doing
       * nothing, and take the decoration down instead — that is the remaining
       * honest way to make a surface carry more with less.
       */
      decoration = shiftDecoration(decoration, 1);
      notes.push('Revised: already at maximum density — reduced decorative treatment instead');
    } else {
      density = next;
      notes.push(`Revised: density increased to ${next}`);
    }
  }

  if (wantsAirier) {
    const next = shiftDensity(density, -1);

    if (next === density) {
      notes.push('Revised: already at the most comfortable density');
    } else {
      density = next;
      notes.push(`Revised: density reduced to ${next}`);
    }
  }

  if (
    /\b(remove|drop|less|fewer|no|reduce)\b[^.]*\b(decorat|ornament|gradient|shadow|accent|colou?r|chrome)\b/.test(text)
  ) {
    decoration = shiftDecoration(decoration, 1);
    notes.push(`Revised: decorative treatment reduced to ${decoration}`);
  }

  if (/\bnarrow(?:er)?\b[^.]*\bsidebar\b|\bsidebar\b[^.]*\bnarrow(?:er)?\b/.test(text)) {
    notes.push('Revised: narrower sidebar');
  }

  return { ...design, density, decoration, adaptationNotes: notes };
}

/** Human-readable summary of what a revision actually changed. */
export function describeRevision(before: DesignContract, after: DesignContract): string[] {
  const changes: string[] = [];

  for (const platform of after.platforms) {
    const a = before.platformDesigns[platform];
    const b = after.platformDesigns[platform];

    if (!a || !b) {
      continue;
    }

    if (a.density !== b.density) {
      changes.push(`${platform}: density ${a.density} → ${b.density}`);
    }

    if (a.decoration !== b.decoration) {
      changes.push(`${platform}: decoration ${a.decoration} → ${b.decoration}`);
    }

    const newNotes = b.adaptationNotes.filter((n) => !a.adaptationNotes.includes(n));

    for (const note of newNotes) {
      changes.push(`${platform}: ${note}`);
    }
  }

  if (changes.length === 0) {
    changes.push('No structural change could be derived from the feedback; recorded as a note for the Builder.');
  }

  return changes;
}

/**
 * Adds a platform's design to an existing contract without touching the others.
 * Used by the add-target flow so previously approved targets stay approved.
 */
export function addPlatformToDesignContract(
  contract: DesignContract,
  platform: ProjectType,
  requirements: EngineeringRequirements,
  prompt: string,
): DesignContract {
  if (contract.platformDesigns[platform]) {
    return contract;
  }

  return {
    ...contract,
    status: 'in_review',
    platforms: [...contract.platforms, platform],
    platformDesigns: {
      ...contract.platformDesigns,
      [platform]: createPlatformDesign(platform, requirements, prompt),
    },
    approvedAt: undefined,
  };
}

/** Serializes a contract. Contains no credentials by construction. */
export function serializeDesignContract(contract: DesignContract): string {
  return JSON.stringify(contract, null, 2);
}

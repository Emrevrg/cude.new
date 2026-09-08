/**
 * Cude.new - Add Platform
 *
 * One product, many platforms. This module makes "make a desktop version of
 * this" a first-class operation rather than a new unrelated prompt: it detects
 * the intent, works out what can be reused, what must be adapted and what is
 * genuinely new, and reports contract-compatibility risk before anything is
 * built.
 *
 * The complexity lives here so the user only has to make one choice.
 */

import type { ProjectType } from './platform';
import type { ProductArchitecture } from './architecture';
import { NODE_IDS, getNode } from './productGraph';

/** What the orchestrator should do with a prompt in an existing product. */
export type ProductIntent = 'CREATE_NEW_PRODUCT' | 'ADD_TARGET' | 'MODIFY_EXISTING';

export interface IntentDetection {
  intent: ProductIntent;

  /** Populated when intent is ADD_TARGET. */
  platform?: ProjectType;

  /** The phrase that decided it, for truthful reporting. */
  evidence?: string;
}

/** Phrases that name a platform, ordered so specific beats generic. */
const PLATFORM_PHRASES: Array<{ platform: ProjectType; pattern: RegExp }> = [
  { platform: 'vscode-extension', pattern: /\bvs\s?code extension\b|\bvisual studio code extension\b/i },
  { platform: 'browser-extension', pattern: /\b(?:browser|chrome|firefox|edge)\s+extension\b|\bweb\s?extension\b/i },
  { platform: 'ios', pattern: /\bios\b|\biphone\b|\bipad\b/i },
  { platform: 'android', pattern: /\bandroid\b/i },
  { platform: 'desktop', pattern: /\bdesktop\b|\bwindows\b|\bmacos\b|\bmac\b|\blinux\b/i },
  { platform: 'pwa', pattern: /\bpwa\b|\bprogressive web app\b/i },
  { platform: 'backend', pattern: /\bbackend\b|\bapi service\b/i },
  { platform: 'web', pattern: /\bweb (?:app|dashboard|version|client|interface)\b|\bwebsite\b|\bweb\b/i },
];

/**
 * Cues that mean "extend what we already have" rather than "start something new".
 * `also`, `too` and `same account` are included because they are how people
 * actually phrase this.
 */
const ADD_CUES = [
  /\badd (?:an?|the)?\s*\w*\s*(?:version|app|client|dashboard|extension|target|platform)\b/i,
  /\b(?:make|create|build|give me|i (?:also )?(?:need|want))\b[^.]*\b(?:version|port)\b/i,
  /\balso need\b/i,
  /\bfor (?:the )?same account\b/i,
  /\badd (?:a )?platform\b/i,
  /\bport (?:this|it) to\b/i,
  /\b(?:make|create|build) (?:this|it) (?:for|on)\b/i,
  /\bgive this product\b/i,
  /\b(?:make|create|build|add)\b[^.]*\bfor (?:this|it)\b/i,
];

/** Cues that clearly mean a brand-new product, overriding the add cues. */
const NEW_PRODUCT_CUES = [/\bnew (?:product|project|app from scratch)\b/i, /\bstart over\b/i, /\bunrelated\b/i];

/**
 * Classifies a prompt against the current product context.
 *
 * Without an existing product every prompt is a new product. With one, phrases
 * like "make a desktop version" must resolve to ADD_TARGET — misclassifying
 * them as CREATE_NEW_PRODUCT would throw away the user's architecture.
 */
export function detectProductIntent(prompt: string, architecture: ProductArchitecture | null): IntentDetection {
  if (!architecture) {
    return { intent: 'CREATE_NEW_PRODUCT' };
  }

  if (NEW_PRODUCT_CUES.some((p) => p.test(prompt))) {
    return { intent: 'CREATE_NEW_PRODUCT' };
  }

  const addCue = ADD_CUES.find((p) => p.test(prompt));

  if (!addCue) {
    return { intent: 'MODIFY_EXISTING' };
  }

  const existing = new Set(architecture.requirements.targetPlatforms);

  for (const { platform, pattern } of PLATFORM_PHRASES) {
    const match = pattern.exec(prompt);

    if (match && !existing.has(platform)) {
      return { intent: 'ADD_TARGET', platform, evidence: match[0] };
    }
  }

  /*
   * An add-shaped phrase naming a platform the product already has is a
   * modification of that target, not a new one.
   */
  return { intent: 'MODIFY_EXISTING' };
}

/*
 * ------------------------------------------------------------------ *
 * Impact analysis
 * ------------------------------------------------------------------
 */

export interface ContractImpact {
  /** True when adding this target needs a change to a shared contract. */
  required: boolean;
  affectedTargets: string[];

  /** Ordered, backwards-compatible migration steps. */
  migrationSteps: string[];
  note: string;
}

export interface AddPlatformPlan {
  platform: ProjectType;

  /** Shared services and packages the new target inherits unchanged. */
  reuse: string[];

  /** Things that exist but must be re-expressed for this platform. */
  adapt: string[];

  /** Genuinely new work. */
  create: string[];

  /** Targets that already exist and will not be touched. */
  preservedTargets: ProjectType[];
  contractImpact: ContractImpact;
}

/** Human labels for the well-known shared nodes. */
const SHARED_LABELS: Array<{ id: string; label: string }> = [
  { id: NODE_IDS.auth, label: 'Authentication' },
  { id: NODE_IDS.api, label: 'API' },
  { id: NODE_IDS.database, label: 'Database' },
  { id: NODE_IDS.sync, label: 'Sync service' },
  { id: NODE_IDS.contracts, label: 'Shared contracts' },
  { id: NODE_IDS.domain, label: 'Domain models' },
  { id: NODE_IDS.design, label: 'Design identity' },
];

/** Platform-specific work that always has to be created fresh. */
function newWorkFor(platform: ProjectType): string[] {
  switch (platform) {
    case 'desktop':
      return ['Desktop application shell', 'Window and menu integration', 'Local persistence adapter'];
    case 'android':
    case 'ios':
    case 'mobile':
      return ['Mobile application shell', 'Platform storage adapter', 'Push/notification integration'];
    case 'browser-extension':
      return ['Extension manifest and background worker', 'Popup surface', 'Content-script bridge'];
    case 'vscode-extension':
    case 'ide-extension':
      return ['Extension activation and commands', 'Side Bar tree provider', 'Contributed configuration'];
    case 'backend':
      return ['Service entry point', 'Route layer', 'Deployment configuration'];
    default:
      return ['Web application shell', 'Routing', 'Browser storage adapter'];
  }
}

/** Aspects of an existing product that must be re-expressed per platform. */
function adaptationsFor(platform: ProjectType): string[] {
  switch (platform) {
    case 'desktop':
      return ['Navigation', 'Window layout', 'Input model (keyboard/mouse)', 'Local persistence'];
    case 'android':
    case 'ios':
    case 'mobile':
      return ['Navigation', 'Touch interaction', 'Screen density', 'Background sync behaviour'];
    case 'browser-extension':
      return ['Navigation', 'Compact popup layout', 'Permission model'];
    case 'vscode-extension':
    case 'ide-extension':
      return ['Navigation', 'Editor-native layout', 'Command and keybinding surface'];
    default:
      return ['Navigation', 'Responsive layout', 'Browser storage'];
  }
}

/**
 * Works out what adding a platform actually involves for this product.
 *
 * Reuse is read from the real product graph, so the summary never claims to
 * reuse a service the product does not have.
 */
export function planAddPlatform(architecture: ProductArchitecture, platform: ProjectType): AddPlatformPlan {
  const graph = architecture.productGraph;

  const reuse = SHARED_LABELS.filter(({ id }) => Boolean(getNode(graph, id))).map(({ label }) => label);

  const preservedTargets = [...architecture.requirements.targetPlatforms];

  /*
   * Contract risk. Adding a consumer to an existing API is additive, so the
   * default is that no breaking change is needed. Offline-capable targets are
   * the case that usually does push a schema change, so it is called out.
   */
  const needsOfflineFields =
    architecture.requirements.offlineRequirements &&
    (platform === 'desktop' || platform === 'android' || platform === 'ios' || platform === 'mobile');

  const contractImpact: ContractImpact = needsOfflineFields
    ? {
        required: true,
        affectedTargets: preservedTargets.map(String),
        migrationSteps: [
          'Add backwards-compatible sync fields to the shared contract',
          'Update the shared domain types',
          `Build the ${platform} consumer against the extended contract`,
          'Re-verify existing targets against the unchanged fields',
          'Retire any legacy path only once every target is verified',
        ],
        note: 'Additive only — existing targets keep working throughout.',
      }
    : {
        required: false,
        affectedTargets: [],
        migrationSteps: [],
        note: 'The new target consumes existing contracts unchanged.',
      };

  return {
    platform,
    reuse,
    adapt: adaptationsFor(platform),
    create: newWorkFor(platform),
    preservedTargets,
    contractImpact,
  };
}

/** Targets that can still be added to this product. */
export function availableTargets(architecture: ProductArchitecture | null): ProjectType[] {
  const candidates: ProjectType[] = [
    'web',
    'android',
    'ios',
    'desktop',
    'browser-extension',
    'vscode-extension',
    'backend',
  ];

  if (!architecture) {
    return candidates;
  }

  const existing = new Set(architecture.requirements.targetPlatforms);

  return candidates.filter((platform) => !existing.has(platform));
}

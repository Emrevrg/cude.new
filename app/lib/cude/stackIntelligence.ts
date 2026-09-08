/**
 * Cude.new - Adaptive Stack Intelligence
 *
 *   REQUIREMENTS → CANDIDATE STACKS → SCORING → CONSTRAINT FILTERING → DECISION
 *
 * There are deliberately no direct mappings such as DESKTOP -> Electron. Each
 * candidate carries intrinsic capability scores; the user's requirements decide
 * how much each dimension is *weighted*. That separation is what lets the same
 * catalog produce Tauri for a low-memory brief and Electron for a ship-fast one.
 */

import type { ProjectType } from './platform';
import {
  isAtLeast,
  priorityRank,
  type EngineeringRequirements,
  type Priority,
  type UserConstraints,
} from './engineeringRequirements';

export type { UserConstraints } from './engineeringRequirements';

export type ScoringDimension =
  | 'performance'
  | 'memory'
  | 'startupSpeed'
  | 'binarySize'
  | 'developmentVelocity'
  | 'ecosystem'
  | 'nativeApi'
  | 'crossPlatform'
  | 'sharedCode'
  | 'deployment'
  | 'maintenance';

export const DIMENSION_KEYS: ScoringDimension[] = [
  'performance',
  'memory',
  'startupSpeed',
  'binarySize',
  'developmentVelocity',
  'ecosystem',
  'nativeApi',
  'crossPlatform',
  'sharedCode',
  'deployment',
  'maintenance',
];

export interface StackCandidate {
  id: string;
  name: string;
  language: string;
  framework: string;
  projectType: ProjectType;

  /** Intrinsic capability per dimension, 0-1. Independent of user priorities. */
  scores: Record<string, number>;

  /** Weighted aggregate, 0-1. Zero when the candidate is rejected. */
  totalScore: number;

  reasons: string[];
  drawbacks: string[];
  confidence: number;

  /** True when a hard constraint disqualified this candidate. */
  rejected: boolean;
  rejectionReasons: string[];

  bundleSize: 'small' | 'medium' | 'large';
  startupMs: number;
  memoryMB: number;
  supportsOffline: boolean;
  supportsRealtime: boolean;
  platformNative: boolean;
  crossPlatform: boolean;
}

export interface StackConflict {
  kind: 'unsatisfiable-preference' | 'no-eligible-candidate';
  message: string;
  requested: string[];

  /** Stacks that remain available despite the conflict. */
  available: string[];
}

export interface StackDecision {
  /** Platform this decision applies to. Decisions are made per target. */
  target: ProjectType;
  selected: StackCandidate;

  /** Viable runners-up, best first. Excludes rejected candidates. */
  alternatives: StackCandidate[];

  /** Every candidate considered, including rejected ones. */
  candidates: StackCandidate[];
  scoreBreakdown: Record<string, number>;
  reasons: string[];
  rejectedReasons: Array<{ candidate: StackCandidate; reason: string }>;
  confidence: number;
  requirements: EngineeringRequirements;
  userOverrides: UserConstraints;

  /** Populated when the user asked for something that could not be honoured. */
  conflicts: StackConflict[];

  /**
   * Hard user constraints that actually determined this decision, in display
   * form (e.g. "Kotlin required", "Rust excluded"). Empty when the choice was
   * made purely on scoring.
   */
  appliedConstraints: string[];
  productName: string;
  version: number;
}

/**
 * Maps a requirement priority onto a scoring weight.
 *
 * `unspecified` is deliberately near-zero. A dimension the user never mentioned
 * must not be able to outvote one they did — and because there are four
 * "smaller is better" dimensions, giving each a middling default weight would
 * quietly bias every decision toward the leanest stack regardless of the brief.
 */
export const PRIORITY_WEIGHTS: Record<Priority, number> = {
  unspecified: 0.25,
  low: 0.15,
  medium: 0.75,
  high: 1.5,
  critical: 2.5,
};

/**
 * Weight given to development velocity when the user expressed no opinion.
 * Absent a stated priority, the sensible engineering default is to favour
 * shipping; an explicit priority (including an explicit `low`) always wins.
 */
const DEFAULT_VELOCITY_WEIGHT = 0.9;

/** Dimensions that always matter to some degree, regardless of the brief. */
const BASELINE_WEIGHTS = {
  ecosystem: 0.8,
  deployment: 0.6,
  maintenance: 0.5,
} as const;

type CatalogEntry = Pick<
  StackCandidate,
  | 'id'
  | 'name'
  | 'language'
  | 'framework'
  | 'projectType'
  | 'bundleSize'
  | 'startupMs'
  | 'memoryMB'
  | 'supportsOffline'
  | 'supportsRealtime'
  | 'platformNative'
  | 'crossPlatform'
> & {
  /** Relative runtime throughput of the language/runtime tier, 0-1. */
  runtimeTier: number;

  /** Ecosystem breadth and library availability, 0-1. */
  ecosystemTier: number;

  /** Iteration speed: hot reload, no compile step, familiarity, 0-1. */
  velocityTier: number;

  /** Long-term maintenance burden, 0-1 (higher = easier). */
  maintenanceTier: number;

  /** How straightforward it is to ship this artefact, 0-1. */
  deploymentTier: number;
};

const STACK_CATALOG: Record<string, CatalogEntry> = {
  /* ---------------- Web ---------------- */
  'react-vite': {
    id: 'react-vite',
    name: 'React + Vite',
    language: 'typescript',
    framework: 'react',
    projectType: 'web',
    bundleSize: 'small',
    startupMs: 800,
    memoryMB: 45,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.95,
    velocityTier: 0.95,
    maintenanceTier: 0.8,
    deploymentTier: 0.95,
  },
  'nextjs-app-router': {
    id: 'nextjs-app-router',
    name: 'Next.js (App Router)',
    language: 'typescript',
    framework: 'next.js',
    projectType: 'web',
    bundleSize: 'medium',
    startupMs: 1200,
    memoryMB: 120,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.9,
    velocityTier: 0.85,
    maintenanceTier: 0.7,
    deploymentTier: 0.85,
  },
  astro: {
    id: 'astro',
    name: 'Astro',
    language: 'typescript',
    framework: 'astro',
    projectType: 'web',
    bundleSize: 'small',
    startupMs: 500,
    memoryMB: 30,
    supportsOffline: true,
    supportsRealtime: false,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.7,
    ecosystemTier: 0.7,
    velocityTier: 0.85,
    maintenanceTier: 0.85,
    deploymentTier: 0.95,
  },
  sveltekit: {
    id: 'sveltekit',
    name: 'SvelteKit',
    language: 'typescript',
    framework: 'svelte',
    projectType: 'web',
    bundleSize: 'small',
    startupMs: 600,
    memoryMB: 35,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.7,
    ecosystemTier: 0.7,
    velocityTier: 0.9,
    maintenanceTier: 0.85,
    deploymentTier: 0.9,
  },
  'vue-vite': {
    id: 'vue-vite',
    name: 'Vue + Vite',
    language: 'typescript',
    framework: 'vue',
    projectType: 'web',
    bundleSize: 'small',
    startupMs: 700,
    memoryMB: 40,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.65,
    ecosystemTier: 0.8,
    velocityTier: 0.9,
    maintenanceTier: 0.8,
    deploymentTier: 0.9,
  },

  /* ---------------- Desktop ---------------- */
  electron: {
    id: 'electron',
    name: 'Electron + TypeScript',
    language: 'typescript',
    framework: 'electron',
    projectType: 'desktop',
    bundleSize: 'large',
    startupMs: 1500,
    memoryMB: 250,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.5,
    ecosystemTier: 0.95,
    velocityTier: 0.95,
    maintenanceTier: 0.75,
    deploymentTier: 0.8,
  },
  tauri: {
    id: 'tauri',
    name: 'Tauri + Rust',
    language: 'rust',
    framework: 'tauri',
    projectType: 'desktop',
    bundleSize: 'small',
    startupMs: 300,
    memoryMB: 25,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.95,
    ecosystemTier: 0.6,
    velocityTier: 0.45,
    maintenanceTier: 0.7,
    deploymentTier: 0.8,
  },
  'compose-desktop': {
    id: 'compose-desktop',
    name: 'Kotlin Compose Desktop',
    language: 'kotlin',
    framework: 'compose-multiplatform',
    projectType: 'desktop',
    bundleSize: 'medium',
    startupMs: 1000,
    memoryMB: 150,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.75,
    ecosystemTier: 0.65,
    velocityTier: 0.6,
    maintenanceTier: 0.75,
    deploymentTier: 0.65,
  },
  'qt-cpp': {
    id: 'qt-cpp',
    name: 'C++ + Qt',
    language: 'cpp',
    framework: 'qt',
    projectType: 'desktop',
    bundleSize: 'medium',
    startupMs: 800,
    memoryMB: 80,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.95,
    ecosystemTier: 0.7,
    velocityTier: 0.3,
    maintenanceTier: 0.5,
    deploymentTier: 0.6,
  },
  'dotnet-winui': {
    id: 'dotnet-winui',
    name: '.NET + WinUI',
    language: 'csharp',
    framework: 'dotnet',
    projectType: 'desktop',
    bundleSize: 'medium',
    startupMs: 900,
    memoryMB: 100,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: false,
    runtimeTier: 0.8,
    ecosystemTier: 0.85,
    velocityTier: 0.7,
    maintenanceTier: 0.8,
    deploymentTier: 0.75,
  },

  /* ---------------- Android ---------------- */
  'kotlin-compose': {
    id: 'kotlin-compose',
    name: 'Kotlin + Jetpack Compose',
    language: 'kotlin',
    framework: 'jetpack-compose',
    projectType: 'android',
    bundleSize: 'small',
    startupMs: 800,
    memoryMB: 80,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: false,
    runtimeTier: 0.85,
    ecosystemTier: 0.85,
    velocityTier: 0.65,
    maintenanceTier: 0.8,
    deploymentTier: 0.85,
  },
  'react-native-android': {
    id: 'react-native-android',
    name: 'React Native + Expo',
    language: 'typescript',
    framework: 'react-native',
    projectType: 'android',
    bundleSize: 'medium',
    startupMs: 1200,
    memoryMB: 120,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.55,
    ecosystemTier: 0.85,
    velocityTier: 0.9,
    maintenanceTier: 0.7,
    deploymentTier: 0.8,
  },
  'flutter-android': {
    id: 'flutter-android',
    name: 'Flutter',
    language: 'dart',
    framework: 'flutter',
    projectType: 'android',
    bundleSize: 'medium',
    startupMs: 900,
    memoryMB: 90,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.8,
    ecosystemTier: 0.75,
    velocityTier: 0.8,
    maintenanceTier: 0.75,
    deploymentTier: 0.8,
  },

  /* ---------------- iOS ---------------- */
  swiftui: {
    id: 'swiftui',
    name: 'Swift + SwiftUI',
    language: 'swift',
    framework: 'swiftui',
    projectType: 'ios',
    bundleSize: 'small',
    startupMs: 700,
    memoryMB: 60,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: false,
    runtimeTier: 0.9,
    ecosystemTier: 0.85,
    velocityTier: 0.7,
    maintenanceTier: 0.8,
    deploymentTier: 0.8,
  },
  'react-native-ios': {
    id: 'react-native-ios',
    name: 'React Native (iOS)',
    language: 'typescript',
    framework: 'react-native',
    projectType: 'ios',
    bundleSize: 'medium',
    startupMs: 1200,
    memoryMB: 120,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.55,
    ecosystemTier: 0.85,
    velocityTier: 0.9,
    maintenanceTier: 0.7,
    deploymentTier: 0.75,
  },

  /* ---------------- Cross-platform mobile ---------------- */
  'react-native-shared': {
    id: 'react-native-shared',
    name: 'React Native (shared)',
    language: 'typescript',
    framework: 'react-native',
    projectType: 'mobile',
    bundleSize: 'medium',
    startupMs: 1200,
    memoryMB: 120,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.55,
    ecosystemTier: 0.85,
    velocityTier: 0.9,
    maintenanceTier: 0.7,
    deploymentTier: 0.8,
  },
  'flutter-shared': {
    id: 'flutter-shared',
    name: 'Flutter (shared)',
    language: 'dart',
    framework: 'flutter',
    projectType: 'mobile',
    bundleSize: 'medium',
    startupMs: 900,
    memoryMB: 90,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.8,
    ecosystemTier: 0.75,
    velocityTier: 0.8,
    maintenanceTier: 0.75,
    deploymentTier: 0.8,
  },
  'kotlin-multiplatform': {
    id: 'kotlin-multiplatform',
    name: 'Kotlin Multiplatform',
    language: 'kotlin',
    framework: 'compose-multiplatform',
    projectType: 'mobile',
    bundleSize: 'medium',
    startupMs: 850,
    memoryMB: 95,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: true,
    crossPlatform: true,
    runtimeTier: 0.85,
    ecosystemTier: 0.65,
    velocityTier: 0.6,
    maintenanceTier: 0.75,
    deploymentTier: 0.7,
  },

  /* ---------------- Backend ---------------- */
  'node-hono': {
    id: 'node-hono',
    name: 'Hono (Node/Edge)',
    language: 'typescript',
    framework: 'hono',
    projectType: 'backend',
    bundleSize: 'small',
    startupMs: 200,
    memoryMB: 50,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.65,
    ecosystemTier: 0.85,
    velocityTier: 0.95,
    maintenanceTier: 0.85,
    deploymentTier: 0.95,
  },
  'node-express': {
    id: 'node-express',
    name: 'Express (Node)',
    language: 'typescript',
    framework: 'express',
    projectType: 'backend',
    bundleSize: 'medium',
    startupMs: 300,
    memoryMB: 70,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.95,
    velocityTier: 0.9,
    maintenanceTier: 0.75,
    deploymentTier: 0.9,
  },
  'rust-axum': {
    id: 'rust-axum',
    name: 'Rust + Axum',
    language: 'rust',
    framework: 'axum',
    projectType: 'backend',
    bundleSize: 'small',
    startupMs: 50,
    memoryMB: 15,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.98,
    ecosystemTier: 0.6,
    velocityTier: 0.45,
    maintenanceTier: 0.7,
    deploymentTier: 0.85,
  },
  'go-gin': {
    id: 'go-gin',
    name: 'Go + Gin',
    language: 'go',
    framework: 'gin',
    projectType: 'backend',
    bundleSize: 'small',
    startupMs: 30,
    memoryMB: 12,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.92,
    ecosystemTier: 0.75,
    velocityTier: 0.75,
    maintenanceTier: 0.85,
    deploymentTier: 0.9,
  },
  'python-fastapi': {
    id: 'python-fastapi',
    name: 'Python + FastAPI',
    language: 'python',
    framework: 'fastapi',
    projectType: 'backend',
    bundleSize: 'medium',
    startupMs: 200,
    memoryMB: 60,
    supportsOffline: false,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.5,
    ecosystemTier: 0.9,
    velocityTier: 0.9,
    maintenanceTier: 0.75,
    deploymentTier: 0.8,
  },

  /* ---------------- PWA ---------------- */
  'pwa-vite': {
    id: 'pwa-vite',
    name: 'React PWA + Vite',
    language: 'typescript',
    framework: 'react',
    projectType: 'pwa',
    bundleSize: 'small',
    startupMs: 700,
    memoryMB: 45,
    supportsOffline: true,
    supportsRealtime: true,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.9,
    velocityTier: 0.95,
    maintenanceTier: 0.8,
    deploymentTier: 0.95,
  },

  /* ---------------- Extensions ---------------- */
  'browser-extension-mv3': {
    id: 'browser-extension-mv3',
    name: 'Manifest V3 + TypeScript',
    language: 'typescript',
    framework: 'webextension',
    projectType: 'browser-extension',
    bundleSize: 'small',
    startupMs: 100,
    memoryMB: 20,
    supportsOffline: true,
    supportsRealtime: false,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.7,
    velocityTier: 0.9,
    maintenanceTier: 0.8,
    deploymentTier: 0.7,
  },
  'vscode-extension-ts': {
    id: 'vscode-extension-ts',
    name: 'VS Code Extension (TypeScript)',
    language: 'typescript',
    framework: 'vscode',
    projectType: 'vscode-extension',
    bundleSize: 'small',
    startupMs: 150,
    memoryMB: 25,
    supportsOffline: true,
    supportsRealtime: false,
    platformNative: false,
    crossPlatform: true,
    runtimeTier: 0.6,
    ecosystemTier: 0.8,
    velocityTier: 0.9,
    maintenanceTier: 0.85,
    deploymentTier: 0.8,
  },
};

/** Normalises "smaller is better" metrics onto a 0-1 scale. */
function inverseScore(value: number, best: number, worst: number): number {
  if (value <= best) {
    return 1;
  }

  if (value >= worst) {
    return 0.05;
  }

  return 1 - (value - best) / (worst - best);
}

const BUNDLE_SCORES: Record<CatalogEntry['bundleSize'], number> = {
  small: 1,
  medium: 0.55,
  large: 0.15,
};

/** Computes intrinsic, requirement-independent capability scores. */
function intrinsicScores(entry: CatalogEntry): Record<ScoringDimension, number> {
  return {
    performance: entry.runtimeTier,
    memory: inverseScore(entry.memoryMB, 20, 260),
    startupSpeed: inverseScore(entry.startupMs, 100, 1600),
    binarySize: BUNDLE_SCORES[entry.bundleSize],
    developmentVelocity: entry.velocityTier,
    ecosystem: entry.ecosystemTier,
    nativeApi: entry.platformNative ? 0.95 : 0.45,
    crossPlatform: entry.crossPlatform ? 0.9 : 0.35,
    sharedCode: entry.crossPlatform ? 0.9 : 0.3,
    deployment: entry.deploymentTier,
    maintenance: entry.maintenanceTier,
  };
}

/** Chooses the weight for each dimension from the user's stated priorities. */
function dimensionWeights(requirements: EngineeringRequirements): Record<ScoringDimension, number> {
  const sharedCodePriority: Priority =
    requirements.targetPlatforms.length > 1 && requirements.sharedCodePriority === 'unspecified'
      ? 'medium'
      : requirements.sharedCodePriority;

  const nativeApiPriority: Priority = requirements.nativeApiRequirements.length > 0 ? 'high' : 'unspecified';

  const crossPlatformPriority: Priority = requirements.targetPlatforms.length > 1 ? 'medium' : 'unspecified';

  return {
    performance: PRIORITY_WEIGHTS[requirements.performancePriority],
    memory: PRIORITY_WEIGHTS[requirements.memoryPriority],
    startupSpeed: PRIORITY_WEIGHTS[requirements.startupSpeedPriority],
    binarySize: PRIORITY_WEIGHTS[requirements.binarySizePriority],
    developmentVelocity:
      requirements.developmentSpeedPriority === 'unspecified'
        ? DEFAULT_VELOCITY_WEIGHT
        : PRIORITY_WEIGHTS[requirements.developmentSpeedPriority],
    ecosystem: BASELINE_WEIGHTS.ecosystem,
    nativeApi: PRIORITY_WEIGHTS[nativeApiPriority],
    crossPlatform: PRIORITY_WEIGHTS[crossPlatformPriority],
    sharedCode: PRIORITY_WEIGHTS[sharedCodePriority],
    deployment: BASELINE_WEIGHTS.deployment,
    maintenance: BASELINE_WEIGHTS.maintenance,
  };
}

/** Explains, in product language, why a candidate scored well or badly. */
function describeCandidate(
  entry: CatalogEntry,
  scores: Record<ScoringDimension, number>,
  requirements: EngineeringRequirements,
): { reasons: string[]; drawbacks: string[] } {
  const reasons: string[] = [];
  const drawbacks: string[] = [];

  if (isAtLeast(requirements.memoryPriority, 'high')) {
    if (scores.memory > 0.75) {
      reasons.push(`Low memory footprint (~${entry.memoryMB} MB)`);
    } else if (scores.memory < 0.4) {
      drawbacks.push(`Higher memory usage (~${entry.memoryMB} MB)`);
    }
  }

  if (isAtLeast(requirements.startupSpeedPriority, 'high')) {
    if (scores.startupSpeed > 0.75) {
      reasons.push(`Fast startup (~${entry.startupMs} ms)`);
    } else if (scores.startupSpeed < 0.4) {
      drawbacks.push(`Slower startup (~${entry.startupMs} ms)`);
    }
  }

  if (isAtLeast(requirements.binarySizePriority, 'high')) {
    if (entry.bundleSize === 'small') {
      reasons.push('Compact distribution');
    } else if (entry.bundleSize === 'large') {
      drawbacks.push('Large distribution size');
    }
  }

  if (isAtLeast(requirements.developmentSpeedPriority, 'high')) {
    if (scores.developmentVelocity > 0.8) {
      reasons.push('Fast iteration and hot reload');
    } else if (scores.developmentVelocity < 0.55) {
      drawbacks.push('Slower build and iteration cycle');
    }
  }

  if (isAtLeast(requirements.performancePriority, 'high') && scores.performance > 0.8) {
    reasons.push('Native-speed runtime');
  }

  if (requirements.nativeApiRequirements.length > 0 && !entry.platformNative) {
    drawbacks.push('Limited native API access');
  }

  if (requirements.offlineRequirements && !entry.supportsOffline) {
    drawbacks.push('No first-class offline story');
  }

  if (scores.ecosystem > 0.85) {
    reasons.push('Mature ecosystem and library availability');
  } else if (scores.ecosystem < 0.65) {
    drawbacks.push('Smaller ecosystem');
  }

  return { reasons, drawbacks };
}

function scoreCandidate(
  entry: CatalogEntry,
  requirements: EngineeringRequirements,
  userConstraints: UserConstraints,
): StackCandidate {
  const scores = intrinsicScores(entry);
  const weights = dimensionWeights(requirements);
  const { reasons, drawbacks } = describeCandidate(entry, scores, requirements);

  /* ---- Hard constraint filtering ---- */
  const rejectionReasons: string[] = [];

  const forbiddenLanguages = new Set([
    ...(userConstraints.forbiddenLanguages ?? []),
    ...requirements.forbiddenLanguages,
  ]);
  const forbiddenFrameworks = new Set([
    ...(userConstraints.forbiddenFrameworks ?? []),
    ...requirements.forbiddenFrameworks,
  ]);

  if (forbiddenLanguages.has(entry.language)) {
    rejectionReasons.push(`${entry.language} was excluded by the user`);
  }

  if (forbiddenFrameworks.has(entry.framework)) {
    rejectionReasons.push(`${entry.framework} was excluded by the user`);
  }

  const rejected = rejectionReasons.length > 0;

  /* ---- Weighted aggregate ---- */
  let weighted = 0;
  let weightSum = 0;

  for (const dimension of DIMENSION_KEYS) {
    const weight = weights[dimension];
    weighted += scores[dimension] * weight;
    weightSum += weight;
  }

  const totalScore = rejected || weightSum === 0 ? 0 : weighted / weightSum;

  return {
    id: entry.id,
    name: entry.name,
    language: entry.language,
    framework: entry.framework,
    projectType: entry.projectType,
    scores,
    totalScore,
    reasons,
    drawbacks,
    confidence: rejected ? 0 : totalScore,
    rejected,
    rejectionReasons,
    bundleSize: entry.bundleSize,
    startupMs: entry.startupMs,
    memoryMB: entry.memoryMB,
    supportsOffline: entry.supportsOffline,
    supportsRealtime: entry.supportsRealtime,
    platformNative: entry.platformNative,
    crossPlatform: entry.crossPlatform,
  };
}

/** Every scored candidate for a platform, best first, rejected ones included. */
export function getStackCandidatesForPlatform(
  projectType: ProjectType,
  requirements: EngineeringRequirements,
  userConstraints: UserConstraints = {},
): StackCandidate[] {
  return Object.values(STACK_CATALOG)
    .filter((entry) => entry.projectType === projectType)
    .map((entry) => scoreCandidate(entry, requirements, userConstraints))
    .sort((a, b) => b.totalScore - a.totalScore);
}

/** Raw catalog access, used by the override UI to list what is selectable. */
export function getCatalogEntriesForPlatform(projectType: ProjectType): CatalogEntry[] {
  return Object.values(STACK_CATALOG).filter((entry) => entry.projectType === projectType);
}

/**
 * Runs the full decision for one target platform.
 *
 * A named language or framework is a HARD preference: if any eligible candidate
 * satisfies it, selection is restricted to those candidates regardless of score.
 * If none can, the request is surfaced as a conflict rather than silently ignored.
 */
export function selectStack(
  prompt: string,
  projectType: ProjectType,
  requirements: EngineeringRequirements,
  userConstraints: UserConstraints = {},
  productName = 'project',
): StackDecision {
  const candidates = getStackCandidatesForPlatform(projectType, requirements, userConstraints);
  const conflicts: StackConflict[] = [];

  const eligible = candidates.filter((c) => !c.rejected);

  if (candidates.length === 0) {
    throw new Error(`No stack candidates are catalogued for platform "${projectType}"`);
  }

  /* ---- Hard preferences ---- */
  const preferredLanguages = new Set([
    ...(userConstraints.preferredLanguages ?? []),
    ...requirements.preferredLanguages,
  ]);
  const preferredFrameworks = new Set([
    ...(userConstraints.preferredFrameworks ?? []),
    ...requirements.preferredFrameworks,
  ]);

  let pool = eligible;

  /** True when a stated user preference, not scoring, decided the outcome. */
  let constrainedByUser = false;

  if (preferredFrameworks.size > 0) {
    const matches = pool.filter((c) => preferredFrameworks.has(c.framework));

    if (matches.length > 0) {
      pool = matches;
      constrainedByUser = true;
    }
  }

  if (preferredLanguages.size > 0) {
    const matches = pool.filter((c) => preferredLanguages.has(c.language));

    if (matches.length > 0) {
      pool = matches;
      constrainedByUser = true;
    } else {
      const requested = [...preferredLanguages].filter((lang) => !candidates.some((c) => c.language === lang));

      if (requested.length > 0 && eligible.length > 0) {
        conflicts.push({
          kind: 'unsatisfiable-preference',
          message: `No ${projectType} stack in the catalog uses ${requested.join(', ')}. Falling back to the best-scoring eligible stack.`,
          requested,
          available: eligible.map((c) => c.name),
        });
      }
    }
  }

  if (pool.length === 0) {
    conflicts.push({
      kind: 'no-eligible-candidate',
      message: `Every ${projectType} candidate was excluded by the stated constraints.`,
      requested: [...new Set([...requirements.forbiddenLanguages, ...requirements.forbiddenFrameworks])],
      available: [],
    });

    // Fall back to the least-bad option rather than crashing the pipeline.
    pool = candidates;
  }

  const ranked = [...pool].sort((a, b) => b.totalScore - a.totalScore);
  const selected = ranked[0];

  const appliedConstraints: string[] = [];

  if (constrainedByUser) {
    for (const language of preferredLanguages) {
      if (selected.language === language) {
        appliedConstraints.push(`${language} required`);
      }
    }

    for (const framework of preferredFrameworks) {
      if (selected.framework === framework) {
        appliedConstraints.push(`${framework} required`);
      }
    }
  }

  for (const candidate of candidates) {
    for (const reason of candidate.rejectionReasons) {
      const match = /^(.+) was excluded by the user$/.exec(reason);

      if (match && !appliedConstraints.includes(`${match[1]} excluded`)) {
        appliedConstraints.push(`${match[1]} excluded`);
      }
    }
  }

  const alternatives = eligible.filter((c) => c.id !== selected.id).slice(0, 4);

  const rejectedReasons = candidates
    .filter((c) => c.id !== selected.id)
    .map((c) => ({
      candidate: c,
      reason: c.rejected
        ? c.rejectionReasons.join('; ')
        : c.drawbacks[0] || `Lower overall fit (${c.totalScore.toFixed(2)} vs ${selected.totalScore.toFixed(2)})`,
    }));

  /*
   * Confidence reflects how clear-cut the decision was, not the raw score.
   *
   * A choice the user dictated is not uncertain, however close the runner-up
   * scored, so an honoured hard preference reports high confidence. Otherwise
   * confidence grows with the margin over the best alternative — a narrow win
   * between two good options is a genuine "medium", not a failure.
   */
  const runnerUp = alternatives[0];
  const margin = runnerUp ? selected.totalScore - runnerUp.totalScore : 0.2;

  let confidence: number;

  if (conflicts.length > 0) {
    confidence = 0.5;
  } else if (constrainedByUser) {
    confidence = 0.92;
  } else {
    confidence = Math.min(0.98, 0.62 + margin * 3);
  }

  return {
    target: projectType,
    selected,
    alternatives,
    candidates,
    scoreBreakdown: selected.scores,
    reasons: selected.reasons,
    rejectedReasons,
    confidence,
    requirements,
    userOverrides: userConstraints,
    conflicts,
    appliedConstraints,
    productName: productName || prompt.slice(0, 40) || 'project',
    version: 1,
  };
}

/**
 * Replaces the selected stack with an explicit user choice, keeping the rest of
 * the decision (candidates, requirements) intact. Bumps `version` so callers can
 * tell an overridden decision from a computed one.
 */
export function applyStackOverride(baseDecision: StackDecision, override: { stackId: string }): StackDecision {
  const fromDecision = baseDecision.candidates.find((c) => c.id === override.stackId);

  const entry = STACK_CATALOG[override.stackId];

  if (!fromDecision && !entry) {
    throw new Error(`Unknown stack "${override.stackId}"`);
  }

  const selected: StackCandidate = fromDecision ?? scoreCandidate(entry, baseDecision.requirements, {});

  const overridden: StackCandidate = {
    ...selected,

    // An explicit choice clears any constraint-based rejection but keeps the note.
    rejected: false,
    reasons: [...selected.reasons, 'Selected explicitly by the user'],
    confidence: 1,
  };

  return {
    ...baseDecision,
    selected: overridden,
    alternatives: baseDecision.candidates.filter((c) => c.id !== overridden.id && !c.rejected).slice(0, 4),
    scoreBreakdown: overridden.scores,
    reasons: overridden.reasons,
    rejectedReasons: baseDecision.candidates
      .filter((c) => c.id !== overridden.id)
      .map((c) => ({ candidate: c, reason: 'Replaced by explicit user selection' })),
    confidence: 1,
    appliedConstraints: [`${overridden.name} selected by the user`],
    version: baseDecision.version + 1,
  };
}

/** One-line rationale for the Architecture Decision surface. */
export function explainDecision(decision: StackDecision): string {
  const top = decision.reasons.slice(0, 2);

  if (top.length === 0) {
    return `${decision.selected.name} is the best overall fit for ${decision.target}.`;
  }

  return `${decision.selected.name}: ${top.join('; ').toLowerCase()}.`;
}

/** Sorted dimension contributions, used for the score breakdown UI. */
export function decisionScoreTable(
  decision: StackDecision,
): Array<{ dimension: ScoringDimension; score: number; weight: number }> {
  const weights = dimensionWeights(decision.requirements);

  return DIMENSION_KEYS.map((dimension) => ({
    dimension,
    score: decision.selected.scores[dimension] ?? 0,
    weight: weights[dimension],
  })).sort((a, b) => b.weight - a.weight || b.score - a.score);
}

export { priorityRank };

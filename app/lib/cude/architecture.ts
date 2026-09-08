/**
 * Cude.new - Architecture Orchestration
 *
 * The single entry point that turns a product prompt into a complete, persistable
 * architecture:
 *
 *   PROMPT → REQUIREMENTS → STACK DECISIONS (per target) → PRODUCT GRAPH
 *          → DESIGN IDENTITY → PLATFORM ADAPTATION → MANIFEST
 *
 * Everything downstream (the Architecture UI, the Product Graph UI, the pipeline
 * and the verification harness) reads the object this module produces. Nothing
 * here does any LLM work — it is deterministic, testable engineering intelligence.
 */

import type { ProjectType } from './platform';
import {
  createDefaultRequirements,
  deriveUserConstraints,
  extractRequirements,
  mergeUserConstraints,
  summarizeRequirements,
  type EngineeringRequirements,
  type RequirementEvidence,
  type UserConstraints,
} from './engineeringRequirements';
import { applyStackOverride, selectStack, type StackDecision } from './stackIntelligence';
import {
  addTargetToProductFamily,
  createProductFamily,
  describeProductGraph,
  validateProductGraph,
  type ProductGraph,
} from './productGraph';
import { createDesignSystem, type DesignSystem, type PresetId } from './designSystem';
import { createPlatformAdapters, type PlatformAdapter } from './platformAdaptation';
import type { DesignContract } from './designContract';
import { createManifest, manifestToArchitectureInput, type CudeProjectManifest } from './projectManifest';

export interface ProductArchitecture {
  productId: string;
  productName: string;
  description: string;
  prompt: string;

  requirements: EngineeringRequirements;
  userConstraints: UserConstraints;
  requirementEvidence: RequirementEvidence[];
  requirementConfidence: number;

  /** One independent decision per target. Targets may use different languages. */
  stackDecisions: Record<string, StackDecision>;

  productGraph: ProductGraph;

  /** Shared product identity. */
  designSystem: DesignSystem;

  /** Per-target adaptation of that identity. */
  platformAdapters: Record<string, PlatformAdapter>;

  /**
   * The design the user approved, once they have. Builder and Visual QA both
   * read this so they agree on what was signed off.
   */
  designContract?: DesignContract;

  createdAt: string;
  version: number;
}

/** Platform used when a prompt names no target at all. */
const FALLBACK_PLATFORM: ProjectType = 'web';

/**
 * Platforms that have no stack catalog of their own and are planned as another
 * platform's decision.
 */
const PLATFORM_ALIASES: Partial<Record<ProjectType, ProjectType>> = {
  auto: 'web',
  fullstack: 'web',
  'ide-extension': 'vscode-extension',
};

function resolvePlatform(platform: ProjectType): ProjectType {
  return PLATFORM_ALIASES[platform] ?? platform;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'product'
  );
}

/** Derives a short product name from the prompt's opening clause. */
export function deriveProductName(prompt: string): string {
  const cleaned = prompt
    .trim()
    .replace(/^(?:please\s+)?(?:build|create|make|generate|develop)\s+(?:me\s+)?(?:an?|the)\s+/i, '')
    .split(/[.\n]/)[0]
    .trim();

  if (!cleaned) {
    return 'Untitled Product';
  }

  const words = cleaned.split(/\s+/).slice(0, 6).join(' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface PlanOptions {
  productId?: string;
  productName?: string;

  /** Explicit platform selection from the UI, overriding prompt detection. */
  platformOverride?: ProjectType;

  /** Hard constraints supplied outside the prompt. */
  userConstraints?: UserConstraints;
  designPreset?: PresetId;
}

/**
 * Runs the full architecture pipeline for a prompt.
 *
 * Stack selection happens per target, so an Android + desktop product can end up
 * with Kotlin on one and Rust on the other — which is usually the right answer.
 */
export function planProductArchitecture(prompt: string, options: PlanOptions = {}): ProductArchitecture {
  const extracted = extractRequirements(prompt);

  let requirements = extracted.requirements;

  if (options.userConstraints) {
    requirements = mergeUserConstraints(requirements, options.userConstraints);
  }

  // An explicit UI platform choice wins over whatever the prompt implied.
  if (options.platformOverride && options.platformOverride !== 'auto') {
    requirements = { ...requirements, targetPlatforms: [options.platformOverride] };
  }

  if (requirements.targetPlatforms.length === 0) {
    requirements = { ...requirements, targetPlatforms: [FALLBACK_PLATFORM] };
  }

  const userConstraints: UserConstraints = {
    ...deriveUserConstraints(requirements),
    ...options.userConstraints,
  };

  const productName = options.productName || deriveProductName(prompt);
  const productId = options.productId || slugify(productName);

  /* ---- Stack decision per target ---- */
  const stackDecisions: Record<string, StackDecision> = {};

  for (const platform of requirements.targetPlatforms) {
    const resolved = resolvePlatform(platform);

    try {
      stackDecisions[platform] = selectStack(prompt, resolved, requirements, userConstraints, productName);
    } catch {
      // A platform with no catalog entries must not abort the whole plan.
      continue;
    }
  }

  /* ---- Product graph ---- */
  const productGraph = createProductFamily(
    productId,
    productName,
    options.productName ? prompt : prompt.trim(),
    requirements.targetPlatforms,
    requirements,
  );

  // Record the chosen stack on each target node so the graph is self-describing.
  for (const [platform, decision] of Object.entries(stackDecisions)) {
    const node = productGraph.nodes.find((n) => n.type === 'target' && n.platform === platform);

    if (node) {
      node.stackId = decision.selected.id;
      node.language = decision.selected.language;
      node.framework = decision.selected.framework;
    }
  }

  /* ---- Design identity and per-platform adaptation ---- */
  const designSystem = createDesignSystem(prompt, options.designPreset);
  const platformAdapters = createPlatformAdapters(requirements.targetPlatforms, designSystem);

  return {
    productId,
    productName,
    description: prompt.trim().slice(0, 280),
    prompt,
    requirements,
    userConstraints,
    requirementEvidence: extracted.evidence,
    requirementConfidence: extracted.confidence,
    stackDecisions,
    productGraph,
    designSystem,
    platformAdapters,
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

export interface AddTargetOutcome {
  architecture: ProductArchitecture;
  addedPlatform: ProjectType;
  stackDecision: StackDecision;

  /** Ids of shared services the new target reuses rather than recreating. */
  reusedServices: string[];

  /** Platforms that existed before and were left untouched. */
  preservedPlatforms: ProjectType[];
  platformAdapter: PlatformAdapter;
}

/**
 * Extends an existing product with a new target.
 *
 * Existing targets, their stack decisions and the shared services are preserved;
 * only the new target is planned. This is the "add a web dashboard for the same
 * account" flow.
 */
export function addTargetToArchitecture(
  architecture: ProductArchitecture,
  newPlatform: ProjectType,
  options: { userConstraints?: UserConstraints; prompt?: string } = {},
): AddTargetOutcome {
  if (architecture.requirements.targetPlatforms.includes(newPlatform)) {
    throw new Error(`Target "${newPlatform}" already exists in this product`);
  }

  const preservedPlatforms = [...architecture.requirements.targetPlatforms];
  const prompt = options.prompt ?? architecture.prompt;

  const requirements: EngineeringRequirements = {
    ...architecture.requirements,
    targetPlatforms: [...architecture.requirements.targetPlatforms, newPlatform],
  };

  const userConstraints: UserConstraints = { ...architecture.userConstraints, ...options.userConstraints };

  const stackDecision = selectStack(
    prompt,
    resolvePlatform(newPlatform),
    requirements,
    userConstraints,
    architecture.productName,
  );

  const { graph, targetNode, reusedServices } = addTargetToProductFamily(
    architecture.productGraph,
    newPlatform,
    requirements,
  );

  targetNode.stackId = stackDecision.selected.id;
  targetNode.language = stackDecision.selected.language;
  targetNode.framework = stackDecision.selected.framework;

  // The product keeps one identity; only the platform adaptation is new.
  const platformAdapters = {
    ...architecture.platformAdapters,
    ...createPlatformAdapters([newPlatform], architecture.designSystem),
  };

  const next: ProductArchitecture = {
    ...architecture,
    requirements,
    userConstraints,
    stackDecisions: { ...architecture.stackDecisions, [newPlatform]: stackDecision },
    productGraph: graph,
    platformAdapters,
    version: architecture.version + 1,
  };

  return {
    architecture: next,
    addedPlatform: newPlatform,
    stackDecision,
    reusedServices,
    preservedPlatforms,
    platformAdapter: platformAdapters[newPlatform],
  };
}

/**
 * Applies an explicit stack choice for one target. Returns a new architecture so
 * the override is a real state change, not a cosmetic one.
 */
export function overrideArchitectureStack(
  architecture: ProductArchitecture,
  platform: ProjectType,
  stackId: string,
): ProductArchitecture {
  const existing = architecture.stackDecisions[platform];

  if (!existing) {
    throw new Error(`No stack decision exists for target "${platform}"`);
  }

  const overridden = applyStackOverride(existing, { stackId });

  const productGraph: ProductGraph = {
    ...architecture.productGraph,
    nodes: architecture.productGraph.nodes.map((node) =>
      node.type === 'target' && node.platform === platform
        ? {
            ...node,
            stackId: overridden.selected.id,
            language: overridden.selected.language,
            framework: overridden.selected.framework,
          }
        : node,
    ),
  };

  return {
    ...architecture,
    stackDecisions: { ...architecture.stackDecisions, [platform]: overridden },
    productGraph,
    version: architecture.version + 1,
  };
}

/*
 * ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------
 */

export function architectureToManifest(architecture: ProductArchitecture): CudeProjectManifest {
  return createManifest({
    productId: architecture.productId,
    productName: architecture.productName,
    description: architecture.description,
    prompt: architecture.prompt,
    requirements: architecture.requirements,
    productGraph: architecture.productGraph,
    stackDecisions: architecture.stackDecisions,
    designSystem: architecture.designSystem,
    platformAdapters: architecture.platformAdapters,
  });
}

/**
 * Rebuilds a working architecture from a persisted manifest. Platform adapters
 * are regenerated rather than stored verbatim, because they are derived data.
 */
export function architectureFromManifest(manifest: CudeProjectManifest): ProductArchitecture {
  const input = manifestToArchitectureInput(manifest);
  const requirements: EngineeringRequirements = {
    ...createDefaultRequirements(),
    ...input.requirements,
  };

  const designSystem = input.designSystem ?? createDesignSystem(manifest.prompt);

  return {
    productId: manifest.productId,
    productName: manifest.productName,
    description: manifest.description,
    prompt: manifest.prompt,
    requirements,
    userConstraints: deriveUserConstraints(requirements),
    requirementEvidence: [],
    requirementConfidence: 0,
    stackDecisions: input.stackDecisions,
    productGraph: input.productGraph,
    designSystem,
    platformAdapters: createPlatformAdapters(requirements.targetPlatforms, designSystem),
    createdAt: manifest.metadata.createdAt,
    version: manifest.metadata.version,
  };
}

/*
 * ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------
 */

export interface ArchitectureSummary {
  productName: string;
  targets: Array<{
    platform: string;
    stackName: string;
    language: string;
    framework: string;
    reasons: string[];
    alternatives: string[];
    confidence: number;
  }>;
  requirementLines: string[];
  sharedServices: string[];
  relationships: string[];
  valid: boolean;
  issues: string[];
}

/** Condenses an architecture into the shape the UI and verification both print. */
export function summarizeArchitecture(architecture: ProductArchitecture): ArchitectureSummary {
  const validation = validateProductGraph(architecture.productGraph);

  return {
    productName: architecture.productName,
    targets: Object.entries(architecture.stackDecisions).map(([platform, decision]) => ({
      platform,
      stackName: decision.selected.name,
      language: decision.selected.language,
      framework: decision.selected.framework,
      reasons: decision.reasons.slice(0, 3),
      alternatives: decision.alternatives.map((a) => a.name),
      confidence: decision.confidence,
    })),
    requirementLines: summarizeRequirements(architecture.requirements),
    sharedServices: architecture.productGraph.nodes.filter((n) => n.type !== 'target').map((n) => n.name),
    relationships: describeProductGraph(architecture.productGraph),
    valid: validation.valid,
    issues: validation.issues,
  };
}

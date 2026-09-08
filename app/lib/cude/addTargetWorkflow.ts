/**
 * Cude.new - Add Target Workflow
 *
 * Continuation of an existing product family: "add a web dashboard for the same
 * account". Existing targets and shared services are preserved; only the new
 * target is planned.
 *
 * This is a thin, explicit wrapper over {@link addTargetToArchitecture} that also
 * keeps the persisted manifest in step, so callers get one call for the whole
 * operation.
 */

import type { ProjectType } from './platform';
import type { UserConstraints } from './engineeringRequirements';
import type { StackDecision } from './stackIntelligence';
import type { PlatformAdapter } from './platformAdaptation';
import type { ProductNode } from './productGraph';
import { getNode } from './productGraph';
import {
  addTargetToArchitecture,
  architectureToManifest,
  overrideArchitectureStack,
  type ProductArchitecture,
} from './architecture';
import type { CudeProjectManifest } from './projectManifest';

export interface AddTargetRequest {
  architecture: ProductArchitecture;
  newPlatform: ProjectType;

  /** Follow-up prompt, e.g. "Add a web dashboard for the same account." */
  prompt?: string;
  userConstraints?: UserConstraints;

  /** Explicit stack choice, bypassing automatic selection. */
  stackOverride?: string;
}

export interface AddTargetResult {
  architecture: ProductArchitecture;
  manifest: CudeProjectManifest;
  newTargetNode: ProductNode;
  stackDecision: StackDecision;
  platformAdapter: PlatformAdapter;

  /** Shared services the new target reuses instead of recreating. */
  reusedServices: string[];

  /** Targets that already existed and were not regenerated. */
  preservedPlatforms: ProjectType[];
}

/**
 * Adds one target to an existing product.
 *
 * Throws when the platform is already present — re-adding a target would be a
 * silent regeneration of work the user already has.
 */
export function addTargetToProduct(request: AddTargetRequest): AddTargetResult {
  const { architecture, newPlatform, prompt, userConstraints, stackOverride } = request;

  const outcome = addTargetToArchitecture(architecture, newPlatform, {
    prompt,
    userConstraints,
  });

  let next = outcome.architecture;
  let stackDecision = outcome.stackDecision;

  if (stackOverride) {
    // Applied inside the same operation so an overridden add-target is atomic.
    next = overrideArchitectureStack(next, newPlatform, stackOverride);
    stackDecision = next.stackDecisions[newPlatform];
  }

  const newTargetNode = getNode(next.productGraph, `target-${newPlatform}`);

  if (!newTargetNode) {
    throw new Error(`Target node for "${newPlatform}" was not created`);
  }

  return {
    architecture: next,
    manifest: architectureToManifest(next),
    newTargetNode,
    stackDecision,
    platformAdapter: next.platformAdapters[newPlatform],
    reusedServices: outcome.reusedServices,
    preservedPlatforms: outcome.preservedPlatforms,
  };
}

/** True when the platform can still be added to this product. */
export function canAddTarget(architecture: ProductArchitecture, platform: ProjectType): boolean {
  return !architecture.requirements.targetPlatforms.includes(platform);
}

/** Platforms that are sensible next steps for an existing product. */
export function suggestedNextTargets(architecture: ProductArchitecture): ProjectType[] {
  const existing = new Set(architecture.requirements.targetPlatforms);
  const candidates: ProjectType[] = ['web', 'android', 'ios', 'desktop', 'backend'];

  return candidates.filter((platform) => !existing.has(platform));
}

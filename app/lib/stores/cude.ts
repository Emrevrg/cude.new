import { atom } from 'nanostores';
import type { ProjectType } from '~/lib/cude/platform';
import { createInitialPipeline, type PipelineState } from '~/lib/cude/agents';
import type { ProjectMemory } from '~/lib/cude/projectMemory';
import type { DesignSystem } from '~/lib/cude/designSystem';
import { overrideArchitectureStack, planProductArchitecture, type ProductArchitecture } from '~/lib/cude/architecture';
import { addTargetToProduct } from '~/lib/cude/addTargetWorkflow';
import { createPlatformAdapters } from '~/lib/cude/platformAdaptation';
import {
  addPlatformToDesignContract,
  approveDesignContract,
  describeRevision,
  reviseDesignContract,
  type DesignContract,
} from '~/lib/cude/designContract';
import { startBuilderStage } from '~/lib/cude/orchestrator';

export const platformStore = atom<ProjectType>('auto');
export const pipelineStore = atom<PipelineState>(createInitialPipeline());
export const projectMemoryStore = atom<ProjectMemory | null>(null);
export const cudeStatusStore = atom<string>('idle');
export const designSystemStore = atom<DesignSystem | null>(null);
export const designSystemStatusStore = atom<'none' | 'draft' | 'active' | 'modified' | 'validation_issue'>('none');

export function setPlatform(p: ProjectType) {
  platformStore.set(p);
}

export function resetPipeline() {
  pipelineStore.set(createInitialPipeline());
}

export function updateAgentStatus(
  agentId: string,
  status: PipelineState['agents'][number]['status'],
  summary?: string,
) {
  const cur = pipelineStore.get();
  const next = {
    ...cur,
    agents: cur.agents.map((a) =>
      a.id === agentId
        ? {
            ...a,
            status,
            summary: summary ?? a.summary,
            ...(status === 'working' ? { startedAt: Date.now() } : {}),
            ...(status === 'complete' || status === 'failed' ? { endedAt: Date.now() } : {}),
          }
        : a,
    ),
  };
  pipelineStore.set(next);
}

export function setPipelineStatus(status: PipelineState['status']) {
  pipelineStore.set({ ...pipelineStore.get(), status });
  cudeStatusStore.set(status);
}

/**
 * A pipeline or design status in words a person would use.
 *
 * The stores keep `design_review` and the header rendered it upper-cased, so
 * the top of the product read like a debug flag — DESIGN_REVIEW, IDLE. It is
 * still the same state, just said plainly: Design review, Idle.
 */
export function formatPipelineStatus(status: string): string {
  const words = status.replace(/_/g, ' ').toLowerCase();

  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/*
 * ------------------------------------------------------------------ *
 * Architecture state
 *
 * Populated by the Product Analyst / Architect stages of the pipeline and read
 * by the Architecture Decision and Product Graph surfaces. When this is null the
 * corresponding panels show their empty state rather than fabricated content.
 * ------------------------------------------------------------------
 */

export const architectureStore = atom<ProductArchitecture | null>(null);

/** The target currently focused in the Architecture UI. */
export const selectedTargetStore = atom<string | null>(null);

export function setArchitecture(architecture: ProductArchitecture | null) {
  architectureStore.set(architecture);

  const first = architecture ? Object.keys(architecture.stackDecisions)[0] : null;
  selectedTargetStore.set(first ?? null);
}

/**
 * Plans an architecture from a prompt and publishes it. Returns the architecture
 * so the caller can feed it into the rest of the pipeline.
 */
export function planArchitectureFromPrompt(prompt: string, platform?: ProjectType): ProductArchitecture | null {
  if (!prompt || !prompt.trim()) {
    return null;
  }

  try {
    const architecture = planProductArchitecture(prompt, {
      platformOverride: platform && platform !== 'auto' ? platform : undefined,
    });

    setArchitecture(architecture);

    return architecture;
  } catch {
    // Architecture planning must never block the chat from proceeding.
    return null;
  }
}

/** Applies a user stack override for one target and republishes the state. */
export function overrideStackForTarget(platform: string, stackId: string) {
  const current = architectureStore.get();

  if (!current) {
    return;
  }

  try {
    architectureStore.set(overrideArchitectureStack(current, platform as ProjectType, stackId));
  } catch {
    // An unknown stack id is a no-op rather than a crash in the UI.
  }
}

/**
 * Adds a new target to the current product family.
 *
 * The existing targets, their stack decisions and any already-approved design
 * are preserved; only the new platform gets a design proposal, and the pipeline
 * returns to design review for that platform alone.
 */
export function addTargetToCurrentProduct(platform: ProjectType, prompt?: string) {
  const current = architectureStore.get();

  if (!current) {
    return null;
  }

  const result = addTargetToProduct({ architecture: current, newPlatform: platform, prompt });
  architectureStore.set(result.architecture);

  const contract = designContractStore.get();

  if (contract) {
    const next = addPlatformToDesignContract(
      contract,
      platform,
      result.architecture.requirements,
      prompt ?? result.architecture.prompt,
    );
    designContractStore.set(next);
    designReviewPlatformStore.set(platform);
    designReviewSurfaceStore.set(next.platformDesigns[platform]?.surfaces[0]?.id ?? null);
    designRevisionSummaryStore.set([]);

    updateAgentStatus('designReview', 'working', `${platform} design proposed — waiting for your approval`);
    setPipelineStatus('design_review');
  }

  return result;
}

/** Convenience wrapper used by the Add Platform surface. */
export function addPlatformToCurrentProduct(platform: ProjectType, prompt?: string) {
  return addTargetToCurrentProduct(platform, prompt);
}

export function clearArchitecture() {
  architectureStore.set(null);
  selectedTargetStore.set(null);
}

/**
 * Attaches the Design Director's output to the current architecture and
 * regenerates the per-platform adaptations from it.
 *
 * The Design Director runs after the architect stage, so the architecture is
 * planned first and the identity is folded in here rather than being overwritten.
 */
export function attachDesignSystemToArchitecture(designSystem: DesignSystem) {
  const current = architectureStore.get();

  if (!current) {
    return;
  }

  architectureStore.set({
    ...current,
    designSystem,
    platformAdapters: createPlatformAdapters(current.requirements.targetPlatforms, designSystem),
  });
}

/*
 * ------------------------------------------------------------------ *
 * Design approval
 *
 * The contract is the artefact the user approves. The Builder stays paused
 * until approveDesignAndBuild() runs — nothing approves on the user's behalf.
 * ------------------------------------------------------------------
 */

export const designContractStore = atom<DesignContract | null>(null);

/** Platform currently focused in the Design Review surface. */
export const designReviewPlatformStore = atom<string | null>(null);

/** Surface (screen) currently focused, per platform. */
export const designReviewSurfaceStore = atom<string | null>(null);

/** Set when a revision changed something, so the review can report what. */
export const designRevisionSummaryStore = atom<string[]>([]);

export function setDesignContract(contract: DesignContract | null) {
  designContractStore.set(contract);

  const firstPlatform = contract ? contract.platforms[0] : null;
  designReviewPlatformStore.set(firstPlatform ?? null);

  const firstSurface =
    contract && firstPlatform ? (contract.platformDesigns[firstPlatform]?.surfaces[0]?.id ?? null) : null;
  designReviewSurfaceStore.set(firstSurface);
  designRevisionSummaryStore.set([]);
}

/**
 * Approves the current design and starts implementation.
 *
 * This is the only path from design review into building.
 */
export function approveDesignAndBuild() {
  const contract = designContractStore.get();

  if (!contract || contract.status === 'approved') {
    return;
  }

  const approved = approveDesignContract(contract);
  designContractStore.set(approved);

  const architecture = architectureStore.get();

  if (architecture) {
    architectureStore.set({ ...architecture, designContract: approved });
  }

  updateAgentStatus('designReview', 'complete', `Design approved · revision ${approved.revision}`);
  setPipelineStatus('design_approved');
  startBuilderStage(designSystemStore.get());
}

/**
 * Records a revision request. Architecture, requirements and the product graph
 * are untouched, and the Builder stays paused.
 */
export function requestDesignChanges(feedback: string, platform?: string) {
  const contract = designContractStore.get();

  if (!contract || !feedback.trim()) {
    return;
  }

  const revised = reviseDesignContract(contract, feedback.trim(), {
    platform: platform as ProjectType | undefined,
  });

  designContractStore.set(revised);
  designRevisionSummaryStore.set(describeRevision(contract, revised));

  updateAgentStatus('designReview', 'working', `Revision ${revised.revision} — waiting for your approval`);
  setPipelineStatus('design_review');
}

/** Adds a platform's design to the contract without disturbing approved ones. */
export function addPlatformToCurrentDesign(platform: ProjectType, prompt: string) {
  const contract = designContractStore.get();
  const architecture = architectureStore.get();

  if (!contract || !architecture) {
    return;
  }

  const next = addPlatformToDesignContract(contract, platform, architecture.requirements, prompt);
  designContractStore.set(next);
  designReviewPlatformStore.set(platform);
  designReviewSurfaceStore.set(next.platformDesigns[platform]?.surfaces[0]?.id ?? null);
}

/*
 * Capture seeding helper — exposed only for deterministic release-media captures.
 * The dev server hot-reloads this file, so Playwright can `evaluate(() => window.__CUDE_SEED....)` .
 */
if (typeof window !== 'undefined') {
  (window as any).__CUDE_SEED = {
    setArchitecture,
    setDesignContract,
    setPipelineStatus,
    updateAgentStatus,
    resetPipeline,
    setPlatform,
    architectureStore,
    designContractStore,
    pipelineStore,
    designSystemStore,
    designSystemStatusStore,
    projectMemoryStore,
    selectedTargetStore,
    designReviewPlatformStore,
    designReviewSurfaceStore,
    designRevisionSummaryStore,
  };
}

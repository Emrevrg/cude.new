/**
 * Cude.new - pipeline session durability.
 *
 * Binds the Cude stores to project persistence so a reload does not discard a
 * product that has already been through requirements, architecture and design
 * review.
 *
 * Kept out of `cude.ts` deliberately: the stores stay a pure in-memory view of
 * the pipeline, and saving is something the application does to them. That also
 * keeps `cude.ts` importable by the verifiers without dragging storage in.
 */

import {
  saveSession,
  loadSession,
  clearSession,
  type ProjectStorage,
  type SessionSnapshot,
} from '~/lib/cude/persistence';
import type { ProductArchitecture } from '~/lib/cude/architecture';
import type { DesignContract } from '~/lib/cude/designContract';
import type { DesignSystem } from '~/lib/cude/designSystem';
import type { ProjectType } from '~/lib/cude/platform';
import {
  architectureStore,
  designContractStore,
  designRevisionSummaryStore,
  designSystemStore,
  platformStore,
  pipelineStore,
  selectedTargetStore,
} from './cude';

/** Capture the pipeline as it stands right now. */
export function captureSession(projectId?: string): Parameters<typeof saveSession>[1] {
  return {
    projectId,
    platform: platformStore.get(),
    status: pipelineStore.get().status,
    architecture: architectureStore.get() ?? undefined,
    designSystem: designSystemStore.get() ?? undefined,
    designContract: designContractStore.get() ?? undefined,
    designRevisionSummary: designRevisionSummaryStore.get(),
    selectedTarget: selectedTargetStore.get(),
  };
}

/** Persist the current pipeline. */
export async function persistSession(storage: ProjectStorage, projectId?: string): Promise<SessionSnapshot> {
  return saveSession(storage, captureSession(projectId));
}

/**
 * Restore a persisted pipeline into the stores.
 *
 * Returns the snapshot that was applied, or null when there was nothing to
 * restore. Each field is applied independently so a partially written snapshot
 * still restores what it does contain.
 */
export async function restoreSession(storage: ProjectStorage): Promise<SessionSnapshot | null> {
  const snapshot = await loadSession(storage);

  if (!snapshot) {
    return null;
  }

  if (snapshot.platform) {
    platformStore.set(snapshot.platform as ProjectType);
  }

  if (snapshot.architecture) {
    architectureStore.set(snapshot.architecture as ProductArchitecture);
  }

  if (snapshot.designSystem) {
    designSystemStore.set(snapshot.designSystem as DesignSystem);
  }

  if (snapshot.designContract) {
    designContractStore.set(snapshot.designContract as DesignContract);
  }

  if (Array.isArray(snapshot.designRevisionSummary)) {
    designRevisionSummaryStore.set(snapshot.designRevisionSummary);
  }

  if (snapshot.selectedTarget !== undefined) {
    selectedTargetStore.set(snapshot.selectedTarget);
  }

  if (snapshot.status) {
    pipelineStore.set({
      ...pipelineStore.get(),
      status: snapshot.status as ReturnType<typeof pipelineStore.get>['status'],
    });
  }

  return snapshot;
}

/** Forget the persisted pipeline. */
export async function forgetSession(storage: ProjectStorage): Promise<void> {
  await clearSession(storage);
}

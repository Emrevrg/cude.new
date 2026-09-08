/**
 * Cude.new - pipeline survives a reload.
 *
 * Exercises the real stores rather than a mock of them: a snapshot is taken
 * from live store state, the stores are reset the way a page reload resets
 * them, and the snapshot is restored.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryProjectStorage } from '~/lib/cude/persistence';
import { persistSession, restoreSession, forgetSession, captureSession } from './cudeSession';
import {
  architectureStore,
  designRevisionSummaryStore,
  platformStore,
  pipelineStore,
  resetPipeline,
  selectedTargetStore,
  setPlatform,
} from './cude';

function resetStores() {
  resetPipeline();
  setPlatform('auto');
  architectureStore.set(null);
  selectedTargetStore.set(null);
  designRevisionSummaryStore.set([]);
}

describe('pipeline session durability', () => {
  let storage: MemoryProjectStorage;

  beforeEach(() => {
    storage = new MemoryProjectStorage();
    resetStores();
  });

  it('captures what the stores currently hold', () => {
    setPlatform('web');
    selectedTargetStore.set('web');

    const snapshot = captureSession('expense-tracker');

    expect(snapshot).toMatchObject({ projectId: 'expense-tracker', platform: 'web', selectedTarget: 'web' });
  });

  it('restores the pipeline after the stores are cleared', async () => {
    setPlatform('android');
    selectedTargetStore.set('android');
    designRevisionSummaryStore.set(['lightened the palette']);

    await persistSession(storage, 'expense-tracker');

    // A page reload starts from fresh stores.
    resetStores();
    expect(platformStore.get()).toBe('auto');

    const restored = await restoreSession(storage);

    expect(restored?.projectId).toBe('expense-tracker');
    expect(platformStore.get()).toBe('android');
    expect(selectedTargetStore.get()).toBe('android');
    expect(designRevisionSummaryStore.get()).toEqual(['lightened the palette']);
  });

  it('restores a pipeline that was mid design review', async () => {
    pipelineStore.set({ ...pipelineStore.get(), status: 'design_review' });
    await persistSession(storage);

    resetStores();
    expect(pipelineStore.get().status).not.toBe('design_review');

    await restoreSession(storage);

    expect(pipelineStore.get().status).toBe('design_review');
  });

  it('reports nothing to restore on a first run', async () => {
    expect(await restoreSession(storage)).toBeNull();
  });

  it('leaves the stores untouched when there is no snapshot', async () => {
    setPlatform('web');
    await restoreSession(storage);

    expect(platformStore.get()).toBe('web');
  });

  it('forgets a session on request', async () => {
    await persistSession(storage);
    await forgetSession(storage);

    expect(await restoreSession(storage)).toBeNull();
  });

  it('restores what a partial snapshot does contain', async () => {
    // A snapshot written by an interrupted save must not break restore.
    await storage.set(
      'session:current',
      JSON.stringify({ schemaVersion: 1, platform: 'desktop', savedAt: new Date().toISOString() }),
    );

    const restored = await restoreSession(storage);

    expect(restored).not.toBeNull();
    expect(platformStore.get()).toBe('desktop');
    expect(architectureStore.get()).toBeNull();
  });
});

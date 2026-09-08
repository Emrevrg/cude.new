/**
 * Cude.new - session snapshot behaviour.
 *
 * The property that matters is that a failure to restore degrades to a fresh
 * session, never to a broken one.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryProjectStorage } from './storage';
import { saveSession, loadSession, clearSession, SESSION_KEY } from './sessionSnapshot';

describe('session snapshot', () => {
  let storage: MemoryProjectStorage;

  beforeEach(() => {
    storage = new MemoryProjectStorage();
  });

  it('reports no session before anything is saved', async () => {
    expect(await loadSession(storage)).toBeNull();
  });

  it('round-trips the pipeline state', async () => {
    await saveSession(storage, {
      projectId: 'expense-tracker',
      platform: 'web',
      status: 'design_review',
      architecture: { targets: ['web'] },
      designContract: { revision: 2 },
      designRevisionSummary: ['made it lighter'],
      selectedTarget: 'web',
    });

    const restored = await loadSession(storage);

    expect(restored).toMatchObject({
      projectId: 'expense-tracker',
      status: 'design_review',
      selectedTarget: 'web',
    });
    expect(restored?.designRevisionSummary).toEqual(['made it lighter']);
    expect(restored?.savedAt).toBeTruthy();
  });

  it('preserves an in-review pipeline across a reload', async () => {
    /*
     * The pipeline used to live in memory only, so reloading during design
     * review threw away a product that had already been through requirements
     * and architecture.
     */
    await saveSession(storage, { status: 'design_review', architecture: { targets: ['web', 'android'] } });

    const restored = await loadSession(storage);

    expect(restored?.status).toBe('design_review');
    expect(restored?.architecture).toEqual({ targets: ['web', 'android'] });
  });

  it('degrades to a fresh session when the snapshot is corrupt', async () => {
    await storage.set(SESSION_KEY, '{ not json');

    expect(await loadSession(storage)).toBeNull();
  });

  it('degrades to a fresh session when the snapshot is from another version', async () => {
    await storage.set(SESSION_KEY, JSON.stringify({ schemaVersion: 99, status: 'building' }));

    expect(await loadSession(storage)).toBeNull();
  });

  it('clears the session', async () => {
    await saveSession(storage, { status: 'building' });
    await clearSession(storage);

    expect(await loadSession(storage)).toBeNull();
  });

  it('keeps the session separate from stored projects', async () => {
    await storage.set('project:x', '{}');
    await saveSession(storage, { status: 'idle' });

    expect((await storage.keys()).filter((k) => k.startsWith('project:'))).toEqual(['project:x']);
  });
});

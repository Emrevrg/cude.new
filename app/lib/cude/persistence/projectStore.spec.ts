/**
 * Cude.new - project persistence behaviour.
 *
 * Covers the full lifecycle the product depends on: create, save, reload,
 * list, export, import, add a target, and revise a design. Credential safety is
 * asserted on both the storage path and the export path, because those are the
 * two places a leaked key would actually escape.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CudeProjectStore } from './projectStore';
import { MemoryProjectStorage } from './storage';
import type { CudeProject } from './types';
import type { EngineeringRequirements } from '~/lib/cude/engineeringRequirements';
import type { ProductGraph } from '~/lib/cude/productGraph';
import type { DesignSystem } from '~/lib/cude/designSystem';
import type { StackDecision } from '~/lib/cude/stackIntelligence';

function requirements(): EngineeringRequirements {
  return {
    targetPlatforms: ['web'],
    deploymentConstraints: [],
    expectedScale: 'small',
    performancePriority: 'medium',
    memoryPriority: 'low',
    binarySizePriority: 'low',
    startupSpeedPriority: 'medium',
    developmentSpeedPriority: 'high',
    sharedCodePriority: 'medium',
    preferredLanguages: ['TypeScript'],
    forbiddenLanguages: [],
    preferredFrameworks: [],
  } as unknown as EngineeringRequirements;
}

function graph(platforms: string[] = ['web']): ProductGraph {
  return {
    nodes: [],
    relationships: [],
    targetPlatforms: platforms,
  } as unknown as ProductGraph;
}

function design(primary = '#101010'): DesignSystem {
  return {
    name: 'Cude Mono',
    tokens: { color: { primary } },
  } as unknown as DesignSystem;
}

/** Minimal but complete stack decision, so the manifest validates cleanly. */
function stackDecision(): StackDecision {
  return {
    target: 'web',
    selected: {
      id: 'remix-ts',
      name: 'Remix + TypeScript',
      language: 'TypeScript',
      framework: 'Remix',
      supportsOffline: false,
      supportsRealtime: false,
    },
    alternatives: [],
    candidates: [],
    scoreBreakdown: {},
    reasons: [],
    rejectedReasons: [],
    confidence: 0.9,
    requirements: requirements(),
    userOverrides: {},
    conflicts: [],
    appliedConstraints: [],
    productName: 'Expense Tracker',
    version: 1,
  } as unknown as StackDecision;
}

function newStore() {
  return new CudeProjectStore(new MemoryProjectStorage());
}

function baseInput() {
  return {
    productId: 'expense-tracker',
    productName: 'Expense Tracker',
    description: 'Track spending across accounts.',
    prompt: 'Build an expense tracker',
    requirements: requirements(),
    productGraph: graph(),
    stackDecisions: { web: stackDecision() },
  };
}

describe('project lifecycle', () => {
  let store: CudeProjectStore;

  beforeEach(() => {
    store = newStore();
  });

  it('creates a project without persisting it', async () => {
    const project = store.create(baseInput());

    expect(project.id).toBe('expense-tracker');
    expect(project.manifest.productName).toBe('Expense Tracker');
    expect(await store.load('expense-tracker')).toBeNull();
  });

  it('saves and reloads a project intact', async () => {
    const created = store.create(baseInput());
    await store.save(created);

    const loaded = await store.load('expense-tracker');

    expect(loaded).not.toBeNull();
    expect(loaded!.manifest.productName).toBe('Expense Tracker');
    expect(loaded!.manifest.requirements.preferredLanguages).toContain('TypeScript');
  });

  it('reports a missing project as null rather than throwing', async () => {
    expect(await store.load('nope')).toBeNull();
  });

  it('lists projects most recently updated first', async () => {
    await store.save(store.create({ ...baseInput(), productId: 'a', productName: 'A' }));
    await store.save(store.create({ ...baseInput(), productId: 'b', productName: 'B' }));

    // Touch A so it becomes the most recent.
    await store.appendMessages('a', [{ id: 'm1', role: 'user', content: 'hi', createdAt: new Date().toISOString() }]);

    const list = await store.list();

    expect(list.map((p) => p.id)).toEqual(['a', 'b']);

    // The graph declares one target platform, so the manifest has one target.
    expect(list[0].targetCount).toBe(1);
  });

  it('survives one corrupt record when listing', async () => {
    const storage = new MemoryProjectStorage();
    store = new CudeProjectStore(storage);
    await store.save(store.create(baseInput()));
    await storage.set('project:broken', 'not json at all');

    const list = await store.list();

    expect(list.map((p) => p.id)).toEqual(['expense-tracker']);
  });

  it('deletes a project', async () => {
    await store.save(store.create(baseInput()));
    await store.delete('expense-tracker');

    expect(await store.load('expense-tracker')).toBeNull();
  });
});

describe('conversation and workspace', () => {
  let store: CudeProjectStore;
  let project: CudeProject;

  beforeEach(async () => {
    store = newStore();
    project = await store.save(store.create(baseInput()));
  });

  it('appends messages across saves', async () => {
    await store.appendMessages(project.id, [
      { id: '1', role: 'user', content: 'build it', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    const after = await store.appendMessages(project.id, [
      { id: '2', role: 'assistant', content: 'building', createdAt: '2026-01-01T00:01:00Z' },
    ]);

    expect(after.messages.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('captures workspace files for reload', async () => {
    await store.saveFiles(project.id, { 'src/App.tsx': 'export default null;' });

    const loaded = await store.load(project.id);

    expect(loaded!.files['src/App.tsx']).toBe('export default null;');
  });

  it('refuses to operate on a project that does not exist', async () => {
    await expect(store.appendMessages('ghost', [])).rejects.toThrow(/No such project/);
  });
});

describe('design revisions', () => {
  let store: CudeProjectStore;

  beforeEach(async () => {
    store = newStore();
    await store.save(store.create(baseInput()));
  });

  it('accumulates revisions instead of overwriting them', async () => {
    await store.saveDesignRevision('expense-tracker', design('#111111'), { approved: false });

    const after = await store.saveDesignRevision('expense-tracker', design('#222222'), {
      feedback: 'too dark',
      approved: true,
    });

    expect(after.designRevisions).toHaveLength(2);
    expect(after.designRevisions[0].revision).toBe(1);
    expect(after.designRevisions[1].feedback).toBe('too dark');
  });

  it('promotes the newest design onto the manifest', async () => {
    await store.saveDesignRevision('expense-tracker', design('#333333'), { approved: true });

    const loaded = await store.load('expense-tracker');

    expect(JSON.stringify(loaded!.manifest.designSystem)).toContain('#333333');
  });

  it('reports the latest approved design, ignoring later rejected ones', async () => {
    await store.saveDesignRevision('expense-tracker', design('#111111'), { approved: true });
    await store.saveDesignRevision('expense-tracker', design('#222222'), { approved: false });

    const approved = await store.approvedDesign('expense-tracker');

    expect(approved?.revision).toBe(1);
  });

  it('reports no approved design before approval', async () => {
    await store.saveDesignRevision('expense-tracker', design(), { approved: false });

    expect(await store.approvedDesign('expense-tracker')).toBeNull();
  });
});

describe('export and import', () => {
  let store: CudeProjectStore;

  beforeEach(async () => {
    store = newStore();
    await store.save(store.create(baseInput()));
  });

  it('round-trips a project through export and import', async () => {
    await store.appendMessages('expense-tracker', [
      { id: '1', role: 'user', content: 'build it', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    await store.saveFiles('expense-tracker', { 'a.ts': 'x' });

    const archive = await store.export('expense-tracker');

    const fresh = newStore();
    const { project, warnings } = await fresh.import(archive);

    expect(warnings).toEqual([]);
    expect(project.manifest.productName).toBe('Expense Tracker');
    expect(project.messages).toHaveLength(1);
    expect(project.files['a.ts']).toBe('x');
    expect(await fresh.load('expense-tracker')).not.toBeNull();
  });

  it('can import under a new id, so a project can be duplicated', async () => {
    const archive = await store.export('expense-tracker');
    const { project } = await store.import(archive, { id: 'expense-tracker-copy' });

    expect(project.id).toBe('expense-tracker-copy');
    expect(await store.load('expense-tracker')).not.toBeNull();
    expect(await store.load('expense-tracker-copy')).not.toBeNull();
  });

  it('warns when the archive was written by another schema version', async () => {
    const archive = JSON.parse(await store.export('expense-tracker'));
    archive.schemaVersion = 999;

    const { warnings } = await store.import(JSON.stringify(archive));

    expect(warnings.join(' ')).toMatch(/schema version 999/);
  });

  it('rejects an archive that is not JSON', async () => {
    await expect(store.import('<html>nope</html>')).rejects.toThrow(/not valid JSON/);
  });

  it('rejects an archive with no manifest', async () => {
    await expect(store.import('{"id":"x"}')).rejects.toThrow(/missing its manifest/);
  });
});

describe('credential safety', () => {
  let store: CudeProjectStore;

  beforeEach(async () => {
    store = newStore();
    await store.save(store.create(baseInput()));
  });

  it('strips a provider key pasted into a chat message before writing it', async () => {
    /*
     * Users paste keys into chat. If the store wrote the message verbatim the
     * key would sit on disk and travel into every export of that project.
     */
    await store.appendMessages('expense-tracker', [
      {
        id: '1',
        role: 'user',
        content: 'use sk-abcdefghijklmnopqrstuvwxyz123456 as my key',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const archive = await store.export('expense-tracker');

    expect(archive).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('strips a credential-shaped value out of captured workspace files', async () => {
    await store.saveFiles('expense-tracker', { '.env': 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234' });

    const archive = await store.export('expense-tracker');

    expect(archive).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234');
  });

  it('never lets a credential in an imported archive reach storage', async () => {
    /*
     * The archive is untrusted input. Whether it is rejected or scrubbed, the
     * property that matters is that the credential is not persisted.
     */
    const archive = JSON.parse(await store.export('expense-tracker'));
    archive.manifest.prompt = 'key is sk-ant-abcdefghijklmnopqrstuvwxyz1234567890';

    const fresh = newStore();
    await fresh.import(JSON.stringify(archive)).catch(() => undefined);

    const reExported = await fresh.export('expense-tracker').catch(() => '');

    expect(reExported).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz1234567890');
  });
});

describe('storage backends', () => {
  it('reports which backend is in use', () => {
    expect(newStore().storageKind).toBe('memory');
  });

  it('keeps projects separate from anything else in storage', async () => {
    const storage = new MemoryProjectStorage({ 'unrelated:thing': 'value' });
    const store = new CudeProjectStore(storage);
    await store.save(store.create(baseInput()));

    const list = await store.list();

    expect(list).toHaveLength(1);
    expect(await storage.get('unrelated:thing')).toBe('value');
  });
});

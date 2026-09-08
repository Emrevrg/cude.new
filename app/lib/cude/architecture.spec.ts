import { describe, expect, it } from 'vitest';
import {
  addTargetToArchitecture,
  architectureFromManifest,
  architectureToManifest,
  deriveProductName,
  overrideArchitectureStack,
  planProductArchitecture,
  summarizeArchitecture,
} from './architecture';
import { addTargetToProduct, canAddTarget, suggestedNextTargets } from './addTargetWorkflow';
import { NODE_IDS, hasRelationship, validateProductGraph } from './productGraph';
import { MANIFEST_SCHEMA_VERSION, deserializeManifest, serializeManifest, validateManifest } from './projectManifest';
import { adaptationsDiffer } from './platformAdaptation';

/** The connected product-family brief from the specification. */
const FAMILY_PROMPT =
  'Build an expense tracker for Android and Windows desktop. ' +
  'Users sign in with the same account. ' +
  'Expenses created on either device must synchronize. ' +
  'It should work offline and sync when the connection returns. ' +
  'Keep the desktop application lightweight.';

const ADD_WEB_PROMPT = 'Add a web dashboard for the same account.';

describe('deriveProductName', () => {
  it('strips the imperative opener', () => {
    expect(deriveProductName('Build an expense tracker for Android.')).toMatch(/^Expense tracker/);
  });

  it('handles an empty prompt', () => {
    expect(deriveProductName('   ')).toBe('Untitled Product');
  });
});

describe('planProductArchitecture — connected product family', () => {
  const architecture = planProductArchitecture(FAMILY_PROMPT);

  it('detects both targets as one product, not two projects', () => {
    expect(architecture.requirements.targetPlatforms).toContain('android');
    expect(architecture.requirements.targetPlatforms).toContain('desktop');
    expect(architecture.productGraph.productId).toBeTruthy();
  });

  it('makes an independent stack decision per target', () => {
    expect(architecture.stackDecisions.android).toBeDefined();
    expect(architecture.stackDecisions.desktop).toBeDefined();
    expect(architecture.stackDecisions.android.target).toBe('android');
    expect(architecture.stackDecisions.desktop.target).toBe('desktop');
  });

  it('does not force both targets onto the same stack', () => {
    expect(architecture.stackDecisions.android.selected.id).not.toBe(architecture.stackDecisions.desktop.selected.id);
  });

  it('honours "keep the desktop lightweight" in the desktop decision', () => {
    expect(architecture.stackDecisions.desktop.selected.bundleSize).toBe('small');
  });

  it('records the chosen stack on each target node', () => {
    const android = architecture.productGraph.nodes.find((n) => n.platform === 'android')!;
    const desktop = architecture.productGraph.nodes.find((n) => n.platform === 'desktop')!;

    expect(android.stackId).toBe(architecture.stackDecisions.android.selected.id);
    expect(desktop.language).toBe(architecture.stackDecisions.desktop.selected.language);
  });

  it('creates shared authentication, API, database and sync', () => {
    const ids = architecture.productGraph.nodes.map((n) => n.id);

    expect(ids).toContain(NODE_IDS.auth);
    expect(ids).toContain(NODE_IDS.api);
    expect(ids).toContain(NODE_IDS.database);
    expect(ids).toContain(NODE_IDS.sync);
  });

  it('captures the offline requirement', () => {
    expect(architecture.requirements.offlineRequirements).toBe(true);
    expect(architecture.requirements.synchronizationRequirements).toContain('conflict-resolution');
  });

  it('establishes every relationship the specification requires', () => {
    const graph = architecture.productGraph;

    expect(hasRelationship(graph, 'target-android', 'SHARES_AUTH', NODE_IDS.auth)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SHARES_AUTH', NODE_IDS.auth)).toBe(true);
    expect(hasRelationship(graph, 'target-android', 'USES_API', NODE_IDS.api)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'USES_API', NODE_IDS.api)).toBe(true);
    expect(hasRelationship(graph, 'target-android', 'SYNC_WITH', NODE_IDS.sync)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SYNC_WITH', NODE_IDS.sync)).toBe(true);
    expect(hasRelationship(graph, NODE_IDS.api, 'USES_DATABASE', NODE_IDS.database)).toBe(true);
  });

  it('produces a structurally valid graph', () => {
    expect(validateProductGraph(architecture.productGraph).issues).toEqual([]);
  });

  it('creates one shared design identity', () => {
    expect(architecture.designSystem).toBeDefined();
    expect(architecture.productGraph.nodes.filter((n) => n.type === 'design')).toHaveLength(1);
  });

  it('adapts that identity per platform rather than stretching one layout', () => {
    const android = architecture.platformAdapters.android;
    const desktop = architecture.platformAdapters.desktop;

    expect(android).toBeDefined();
    expect(desktop).toBeDefined();
    expect(adaptationsDiffer(android, desktop)).toBe(true);
    expect(android.profile.inputMethod).toBe('touch');
    expect(android.touchTargetMin).toBeGreaterThanOrEqual(48);
    expect(desktop.touchTargetMin).toBeLessThan(android.touchTargetMin);
  });
});

describe('single-target products stay simple', () => {
  const architecture = planProductArchitecture('Build a marketing landing page for a coffee shop.');

  it('creates no backend, database or sync service', () => {
    const ids = architecture.productGraph.nodes.map((n) => n.id);

    expect(ids).not.toContain(NODE_IDS.api);
    expect(ids).not.toContain(NODE_IDS.database);
    expect(ids).not.toContain(NODE_IDS.sync);
  });

  it('still produces a stack decision and a design identity', () => {
    expect(Object.keys(architecture.stackDecisions)).toHaveLength(1);
    expect(architecture.designSystem).toBeDefined();
  });
});

describe('platform override from the UI', () => {
  it('wins over prompt-based detection', () => {
    const architecture = planProductArchitecture('Build a note taking tool.', { platformOverride: 'android' });

    expect(architecture.requirements.targetPlatforms).toEqual(['android']);
    expect(architecture.stackDecisions.android).toBeDefined();
  });
});

describe('add target — web dashboard for the same account', () => {
  const base = planProductArchitecture(FAMILY_PROMPT);
  const outcome = addTargetToArchitecture(base, 'web', { prompt: ADD_WEB_PROMPT });

  it('adds the web target', () => {
    expect(outcome.addedPlatform).toBe('web');
    expect(outcome.architecture.requirements.targetPlatforms).toContain('web');
  });

  it('preserves the existing targets', () => {
    expect(outcome.preservedPlatforms).toEqual(expect.arrayContaining(['android', 'desktop']));
    expect(outcome.architecture.stackDecisions.android).toEqual(base.stackDecisions.android);
    expect(outcome.architecture.stackDecisions.desktop).toEqual(base.stackDecisions.desktop);
  });

  it('reuses auth, API and database rather than recreating them', () => {
    expect(outcome.reusedServices).toContain(NODE_IDS.auth);
    expect(outcome.reusedServices).toContain(NODE_IDS.api);
    expect(outcome.reusedServices).toContain(NODE_IDS.database);
  });

  it('creates a new stack decision for web', () => {
    expect(outcome.stackDecision.target).toBe('web');
    expect(outcome.architecture.stackDecisions.web.selected.projectType).toBe('web');
  });

  it('reuses the product design identity', () => {
    expect(outcome.architecture.designSystem).toBe(base.designSystem);
    expect(
      hasRelationship(outcome.architecture.productGraph, 'target-web', 'SHARES_DESIGN_SYSTEM', NODE_IDS.design),
    ).toBe(true);
  });

  it('creates a web-specific design adaptation', () => {
    const web = outcome.platformAdapter;

    expect(web.platform).toBe('web');
    expect(adaptationsDiffer(web, outcome.architecture.platformAdapters.android)).toBe(true);
  });

  it('leaves the graph valid', () => {
    expect(validateProductGraph(outcome.architecture.productGraph).issues).toEqual([]);
  });

  it('bumps the architecture version', () => {
    expect(outcome.architecture.version).toBe(base.version + 1);
  });

  it('refuses to add a target that already exists', () => {
    expect(() => addTargetToArchitecture(outcome.architecture, 'android')).toThrow(/already exists/i);
  });
});

describe('addTargetToProduct workflow wrapper', () => {
  const base = planProductArchitecture(FAMILY_PROMPT);

  it('returns an updated architecture and a matching manifest', () => {
    const result = addTargetToProduct({ architecture: base, newPlatform: 'web', prompt: ADD_WEB_PROMPT });

    expect(result.newTargetNode.platform).toBe('web');
    expect(result.manifest.targets.map((t) => t.platform)).toEqual(
      expect.arrayContaining(['android', 'desktop', 'web']),
    );
    expect(validateManifest(result.manifest).valid).toBe(true);
  });

  it('supports an explicit stack override while adding', () => {
    const result = addTargetToProduct({
      architecture: base,
      newPlatform: 'web',
      stackOverride: 'astro',
    });

    expect(result.stackDecision.selected.id).toBe('astro');
  });

  it('reports whether a target can still be added', () => {
    expect(canAddTarget(base, 'web')).toBe(true);
    expect(canAddTarget(base, 'android')).toBe(false);
  });

  it('suggests only targets that do not exist yet', () => {
    const suggestions = suggestedNextTargets(base);

    expect(suggestions).toContain('web');
    expect(suggestions).not.toContain('android');
    expect(suggestions).not.toContain('desktop');
  });
});

describe('stack override on an existing architecture', () => {
  const base = planProductArchitecture(FAMILY_PROMPT);

  it('changes the selected stack for one target only', () => {
    const overridden = overrideArchitectureStack(base, 'desktop', 'electron');

    expect(overridden.stackDecisions.desktop.selected.id).toBe('electron');
    expect(overridden.stackDecisions.android).toEqual(base.stackDecisions.android);
  });

  it('updates the target node in the graph', () => {
    const overridden = overrideArchitectureStack(base, 'desktop', 'electron');
    const node = overridden.productGraph.nodes.find((n) => n.platform === 'desktop')!;

    expect(node.stackId).toBe('electron');
    expect(node.framework).toBe('electron');
  });

  it('is a real state change, not a cosmetic one', () => {
    const overridden = overrideArchitectureStack(base, 'desktop', 'electron');
    expect(overridden.version).toBeGreaterThan(base.version);
  });

  it('throws for a target that does not exist', () => {
    expect(() => overrideArchitectureStack(base, 'ios', 'swiftui')).toThrow(/no stack decision/i);
  });
});

describe('cude.project.json persistence', () => {
  const architecture = planProductArchitecture(FAMILY_PROMPT);
  const manifest = architectureToManifest(architecture);

  it('serializes to valid JSON at the current schema version', () => {
    const json = serializeManifest(manifest);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(parsed.productName).toBe(architecture.productName);
  });

  it('round-trips without losing targets, graph or stack decisions', () => {
    const restored = deserializeManifest(serializeManifest(manifest));

    expect(restored.targets).toHaveLength(manifest.targets.length);
    expect(restored.productGraph.relationships).toHaveLength(manifest.productGraph.relationships.length);
    expect(Object.keys(restored.stackDecisions).sort()).toEqual(Object.keys(manifest.stackDecisions).sort());
  });

  it('records the per-target platform adaptation', () => {
    const android = manifest.targets.find((t) => t.platform === 'android')!;
    const desktop = manifest.targets.find((t) => t.platform === 'desktop')!;

    expect(android.navigationPattern).toBeTruthy();
    expect(android.navigationPattern).not.toBe(desktop.navigationPattern);
  });

  it('rebuilds a working architecture from the manifest', () => {
    const restored = architectureFromManifest(deserializeManifest(serializeManifest(manifest)));

    expect(restored.requirements.targetPlatforms).toEqual(architecture.requirements.targetPlatforms);
    expect(restored.stackDecisions.desktop.selected.id).toBe(architecture.stackDecisions.desktop.selected.id);
    expect(Object.keys(restored.platformAdapters)).toEqual(expect.arrayContaining(['android', 'desktop']));
  });

  it('rejects a manifest written by a newer schema', () => {
    const future = JSON.stringify({ ...manifest, schemaVersion: MANIFEST_SCHEMA_VERSION + 1 });
    expect(() => deserializeManifest(future)).toThrow(/newer version/i);
  });

  it('rejects malformed JSON with a useful message', () => {
    expect(() => deserializeManifest('{ not json')).toThrow(/not valid JSON/i);
  });

  it('validates cleanly for a real architecture', () => {
    const result = validateManifest(manifest);

    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('manifest secret exclusion', () => {
  const architecture = planProductArchitecture(FAMILY_PROMPT);

  it('strips credential-shaped keys on serialization', () => {
    const manifest = architectureToManifest(architecture);
    (manifest.requirements.customConstraints as Record<string, unknown>).apiKey = 'sk-abcdefghijklmnopqrstuvwxyz123456';

    const json = serializeManifest(manifest);

    expect(json).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(json).not.toContain('apiKey');
  });

  it('strips credential-shaped values even under an innocent key', () => {
    const manifest = architectureToManifest(architecture);
    (manifest.metadata as unknown as Record<string, unknown>).note = 'ghp_abcdefghijklmnopqrstuvwxyz1234';

    expect(serializeManifest(manifest)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234');
  });

  it('flags a secret during validation rather than silently accepting it', () => {
    const manifest = architectureToManifest(architecture);
    (manifest.metadata as unknown as Record<string, unknown>).token = 'value';

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.secretsFound.length).toBeGreaterThan(0);
  });

  it('never writes an API key that reached the architecture object', () => {
    const manifest = architectureToManifest(architecture);
    manifest.productGraph.metadata.access_token = 'AKIAIOSFODNN7EXAMPLE';

    const json = serializeManifest(manifest);

    expect(json).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});

describe('summarizeArchitecture', () => {
  const summary = summarizeArchitecture(planProductArchitecture(FAMILY_PROMPT));

  it('summarises every target with a reason and alternatives', () => {
    expect(summary.targets).toHaveLength(2);

    for (const target of summary.targets) {
      expect(target.stackName).toBeTruthy();
      expect(target.alternatives.length).toBeGreaterThan(0);
      expect(target.confidence).toBeGreaterThan(0);
    }
  });

  it('lists the shared services and relationships', () => {
    expect(summary.sharedServices.length).toBeGreaterThan(0);
    expect(summary.relationships.some((r) => r.includes('SHARES_AUTH'))).toBe(true);
  });

  it('reports the graph as valid', () => {
    expect(summary.valid).toBe(true);
  });
});

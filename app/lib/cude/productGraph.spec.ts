import { describe, expect, it } from 'vitest';
import { createDefaultRequirements, extractRequirements } from './engineeringRequirements';
import {
  NODE_IDS,
  addRelationship,
  addTargetToProductFamily,
  createProductFamily,
  describeProductGraph,
  getNode,
  getSharedServices,
  getTargetNodes,
  hasRelationship,
  planSharedServices,
  validateProductGraph,
} from './productGraph';

const FAMILY_PROMPT =
  'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. ' +
  'Expenses created on either device must synchronize. It should work offline and sync when the connection returns. ' +
  'Keep the desktop application lightweight.';

function familyGraph() {
  const { requirements } = extractRequirements(FAMILY_PROMPT);
  return createProductFamily('expense', 'Expense Tracker', FAMILY_PROMPT, ['android', 'desktop'], requirements);
}

describe('planSharedServices', () => {
  it('creates nothing for a simple single-target site', () => {
    const { requirements } = extractRequirements('Build a marketing landing page.');
    const plan = planSharedServices(['web'], requirements);

    expect(plan.needsApi).toBe(false);
    expect(plan.needsSync).toBe(false);
    expect(plan.needsSharedDomain).toBe(false);
  });

  it('does not create a backend for every project', () => {
    const { requirements } = extractRequirements('Build a browser-based markdown previewer.');
    const graph = createProductFamily('md', 'Markdown', 'x', ['web'], requirements);

    expect(getNode(graph, NODE_IDS.api)).toBeUndefined();
    expect(getNode(graph, NODE_IDS.database)).toBeUndefined();
    expect(getNode(graph, NODE_IDS.sync)).toBeUndefined();
  });

  it('creates auth, database, api and sync for a synchronised multi-target product', () => {
    const { requirements } = extractRequirements(FAMILY_PROMPT);
    const plan = planSharedServices(['android', 'desktop'], requirements);

    expect(plan.needsAuth).toBe(true);
    expect(plan.needsDatabase).toBe(true);
    expect(plan.needsApi).toBe(true);
    expect(plan.needsSync).toBe(true);
  });

  it('does not create a sync service for a single target', () => {
    const { requirements } = extractRequirements('Build an Android app that syncs notes. Users sign in.');
    const plan = planSharedServices(['android'], requirements);

    expect(plan.needsSync).toBe(false);
  });
});

describe('createProductFamily', () => {
  const graph = familyGraph();

  it('creates one node per target', () => {
    const targets = getTargetNodes(graph);

    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.platform).sort()).toEqual(['android', 'desktop']);
  });

  it('creates the shared services the brief calls for', () => {
    expect(getNode(graph, NODE_IDS.auth)).toBeDefined();
    expect(getNode(graph, NODE_IDS.api)).toBeDefined();
    expect(getNode(graph, NODE_IDS.database)).toBeDefined();
    expect(getNode(graph, NODE_IDS.sync)).toBeDefined();
  });

  it('gives the product exactly one design identity', () => {
    const designNodes = graph.nodes.filter((n) => n.type === 'design');
    expect(designNodes).toHaveLength(1);
  });

  it('establishes SHARES_AUTH from both targets', () => {
    expect(hasRelationship(graph, 'target-android', 'SHARES_AUTH', NODE_IDS.auth)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SHARES_AUTH', NODE_IDS.auth)).toBe(true);
  });

  it('establishes USES_API from both targets', () => {
    expect(hasRelationship(graph, 'target-android', 'USES_API', NODE_IDS.api)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'USES_API', NODE_IDS.api)).toBe(true);
  });

  it('establishes SYNC_WITH from both targets', () => {
    expect(hasRelationship(graph, 'target-android', 'SYNC_WITH', NODE_IDS.sync)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SYNC_WITH', NODE_IDS.sync)).toBe(true);
  });

  it('routes database access through the API, not from the clients', () => {
    expect(hasRelationship(graph, NODE_IDS.api, 'USES_DATABASE', NODE_IDS.database)).toBe(true);
    expect(hasRelationship(graph, 'target-android', 'USES_DATABASE', NODE_IDS.database)).toBe(false);
    expect(hasRelationship(graph, 'target-desktop', 'USES_DATABASE', NODE_IDS.database)).toBe(false);
  });

  it('shares the design identity with every target', () => {
    expect(hasRelationship(graph, 'target-android', 'SHARES_DESIGN_SYSTEM', NODE_IDS.design)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SHARES_DESIGN_SYSTEM', NODE_IDS.design)).toBe(true);
  });

  it('shares domain and contracts across targets', () => {
    expect(hasRelationship(graph, 'target-android', 'SHARES_DOMAIN', NODE_IDS.domain)).toBe(true);
    expect(hasRelationship(graph, 'target-desktop', 'SHARES_TYPES', NODE_IDS.contracts)).toBe(true);
  });

  it('validates cleanly', () => {
    const result = validateProductGraph(graph);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('validateProductGraph', () => {
  it('actually detects a missing auth edge rather than passing silently', () => {
    const graph = familyGraph();
    graph.relationships = graph.relationships.filter(
      (r) => !(r.source === 'target-android' && r.type === 'SHARES_AUTH'),
    );

    const result = validateProductGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/target-android.*SHARES_AUTH/);
  });

  it('detects a dangling relationship', () => {
    const graph = familyGraph();
    graph.relationships.push({
      id: 'bogus',
      source: 'target-android',
      target: 'service-does-not-exist',
      type: 'USES_API',
    });

    const result = validateProductGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/unknown target/i);
  });

  it('detects a client bypassing the API', () => {
    const graph = familyGraph();
    graph.relationships.push({
      id: 'bypass',
      source: 'target-android',
      target: NODE_IDS.database,
      type: 'USES_DATABASE',
    });

    const result = validateProductGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/bypasses the API/i);
  });

  it('detects a duplicate relationship', () => {
    const graph = familyGraph();
    graph.relationships.push({ ...graph.relationships[0], id: 'copy' });

    const result = validateProductGraph(graph);

    expect(result.issues.join(' ')).toMatch(/duplicate/i);
  });

  it('flags a declared target with no node', () => {
    const graph = familyGraph();
    graph.targetPlatforms.push('ios');

    const result = validateProductGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/ios/);
  });
});

describe('addRelationship idempotency', () => {
  it('ignores an exact duplicate edge', () => {
    const graph = familyGraph();
    const before = graph.relationships.length;

    addRelationship(graph, { source: 'target-android', target: NODE_IDS.auth, type: 'SHARES_AUTH' });

    expect(graph.relationships).toHaveLength(before);
  });

  it('refuses to connect nodes that do not exist', () => {
    const graph = familyGraph();
    const result = addRelationship(graph, { source: 'ghost', target: NODE_IDS.auth, type: 'SHARES_AUTH' });

    expect(result).toBeUndefined();
  });
});

describe('addTargetToProductFamily', () => {
  it('adds the new target and preserves the existing ones', () => {
    const graph = familyGraph();
    const { graph: updated, targetNode } = addTargetToProductFamily(graph, 'web', createDefaultRequirements());

    expect(targetNode.platform).toBe('web');
    expect(getNode(updated, 'target-android')).toBeDefined();
    expect(getNode(updated, 'target-desktop')).toBeDefined();
    expect(getTargetNodes(updated)).toHaveLength(3);
  });

  it('reuses the existing shared services instead of creating new ones', () => {
    const graph = familyGraph();
    const servicesBefore = getSharedServices(graph)
      .map((n) => n.id)
      .sort();

    const { graph: updated, reusedServices } = addTargetToProductFamily(graph, 'web', createDefaultRequirements());

    expect(
      getSharedServices(updated)
        .map((n) => n.id)
        .sort(),
    ).toEqual(servicesBefore);
    expect(reusedServices).toContain(NODE_IDS.auth);
    expect(reusedServices).toContain(NODE_IDS.api);
    expect(reusedServices).toContain(NODE_IDS.database);
  });

  it('connects the new target to the reused services', () => {
    const graph = familyGraph();
    const { graph: updated } = addTargetToProductFamily(graph, 'web', createDefaultRequirements());

    expect(hasRelationship(updated, 'target-web', 'SHARES_AUTH', NODE_IDS.auth)).toBe(true);
    expect(hasRelationship(updated, 'target-web', 'USES_API', NODE_IDS.api)).toBe(true);
    expect(hasRelationship(updated, 'target-web', 'SYNC_WITH', NODE_IDS.sync)).toBe(true);
    expect(hasRelationship(updated, 'target-web', 'SHARES_DESIGN_SYSTEM', NODE_IDS.design)).toBe(true);
  });

  it('leaves the graph valid after the addition', () => {
    const graph = familyGraph();
    const { graph: updated } = addTargetToProductFamily(graph, 'web', createDefaultRequirements());

    expect(validateProductGraph(updated).issues).toEqual([]);
  });

  it('is idempotent for a platform that already exists', () => {
    const graph = familyGraph();
    const before = graph.nodes.length;

    addTargetToProductFamily(graph, 'android', createDefaultRequirements());

    expect(graph.nodes).toHaveLength(before);
  });
});

describe('describeProductGraph', () => {
  it('renders readable relationship lines', () => {
    const lines = describeProductGraph(familyGraph());

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('SHARES_AUTH'))).toBe(true);
  });
});

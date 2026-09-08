/**
 * Cude.new - Product Graph
 *
 * A product family is one product with several targets, not several unrelated
 * projects. The graph is the shared truth about which applications exist, which
 * services they have in common, and how they are connected.
 *
 * Services are created from requirements, never by default: a single-target web
 * app gets no backend, no auth service and no sync service unless the brief
 * actually calls for them.
 */

import type { ProjectType } from './platform';
import type { EngineeringRequirements } from './engineeringRequirements';
import { createDefaultRequirements } from './engineeringRequirements';

export type RelationshipType =
  | 'USES_API'
  | 'USES_DATABASE'
  | 'SHARES_AUTH'
  | 'SHARES_TYPES'
  | 'SHARES_DOMAIN'
  | 'SHARES_DESIGN_SYSTEM'
  | 'SYNC_WITH'
  | 'DEPENDS_ON';

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'USES_API',
  'USES_DATABASE',
  'SHARES_AUTH',
  'SHARES_TYPES',
  'SHARES_DOMAIN',
  'SHARES_DESIGN_SYSTEM',
  'SYNC_WITH',
  'DEPENDS_ON',
];

export type NodeType = 'target' | 'service' | 'database' | 'auth' | 'sync' | 'contract' | 'design';

export interface ProductNode {
  id: string;
  name: string;
  type: NodeType;
  platform?: ProjectType;
  description?: string;
  stackId?: string;
  language?: string;
  framework?: string;
  capabilities: string[];
  hasOfflineSupport?: boolean;
  hasRealtimeSync?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProductRelationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  description?: string;
}

export interface ProductGraph {
  productId: string;
  name: string;
  description: string;
  targetPlatforms: ProjectType[];

  /** Every node, targets and services alike. The single source of truth. */
  nodes: ProductNode[];
  relationships: ProductRelationship[];
  verification: {
    lastUpdated: string;
    schemaVersion: number;
  };
  metadata: Record<string, unknown>;
}

export const GRAPH_SCHEMA_VERSION = 1;

/** Well-known node ids so targets added later can find existing services. */
export const NODE_IDS = {
  auth: 'service-auth',
  api: 'service-api',
  database: 'service-database',
  sync: 'service-sync',
  contracts: 'package-contracts',
  domain: 'package-domain',
  design: 'design-identity',
} as const;

export function createProductGraph(
  productId: string,
  name: string,
  description: string,
  targetPlatforms: ProjectType[] = [],
): ProductGraph {
  return {
    productId,
    name,
    description,
    targetPlatforms: [...targetPlatforms],
    nodes: [],
    relationships: [],
    verification: {
      lastUpdated: new Date().toISOString(),
      schemaVersion: GRAPH_SCHEMA_VERSION,
    },
    metadata: { createdAt: new Date().toISOString() },
  };
}

export function getNode(graph: ProductGraph, id: string): ProductNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Adds a node, or returns the existing one if the id is already present. */
export function addNode(graph: ProductGraph, node: ProductNode): ProductNode {
  const existing = getNode(graph, node.id);

  if (existing) {
    return existing;
  }

  graph.nodes.push(node);

  return node;
}

/**
 * Adds a relationship. Duplicate (source, target, type) triples are ignored so
 * that re-running the workflow is idempotent.
 */
export function addRelationship(
  graph: ProductGraph,
  rel: Omit<ProductRelationship, 'id'> & { id?: string },
): ProductRelationship | undefined {
  if (!getNode(graph, rel.source) || !getNode(graph, rel.target)) {
    return undefined;
  }

  const existing = graph.relationships.find(
    (r) => r.source === rel.source && r.target === rel.target && r.type === rel.type,
  );

  if (existing) {
    return existing;
  }

  const full: ProductRelationship = {
    id: rel.id || `${rel.source}--${rel.type}--${rel.target}`,
    source: rel.source,
    target: rel.target,
    type: rel.type,
    description: rel.description,
  };

  graph.relationships.push(full);

  return full;
}

/*
 * ------------------------------------------------------------------ *
 * Requirement-driven service planning
 * ------------------------------------------------------------------
 */

export interface ServicePlan {
  needsAuth: boolean;
  needsApi: boolean;
  needsDatabase: boolean;
  needsSync: boolean;
  needsSharedContracts: boolean;
  needsSharedDomain: boolean;
}

/**
 * Decides which shared services a product actually needs.
 *
 * Deliberately conservative: a lone front-end with no accounts, no persistence
 * and no sync gets nothing but a design identity.
 */
export function planSharedServices(targetPlatforms: ProjectType[], requirements: EngineeringRequirements): ServicePlan {
  const multiTarget = targetPlatforms.length > 1;

  const needsAuth = requirements.authenticationRequirements.length > 0;
  const needsSync = requirements.synchronizationRequirements.length > 0 && multiTarget;
  const needsDatabase = requirements.databaseRequirements.length > 0 || needsSync || needsAuth;

  /*
   * An API is warranted when something must be shared across a boundary, or the
   * user explicitly asked for a backend.
   */
  const needsApi =
    targetPlatforms.includes('backend') || needsSync || (needsAuth && multiTarget) || (needsDatabase && multiTarget);

  return {
    needsAuth,
    needsApi,
    needsDatabase,
    needsSync,
    needsSharedContracts: multiTarget && (needsApi || needsSync),
    needsSharedDomain: multiTarget,
  };
}

function targetNodeId(platform: ProjectType): string {
  return `target-${platform}`;
}

function humanPlatform(platform: ProjectType): string {
  return platform
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createTargetNode(platform: ProjectType, requirements: EngineeringRequirements): ProductNode {
  return {
    id: targetNodeId(platform),
    name: `${humanPlatform(platform)} App`,
    type: 'target',
    platform,
    description: `${humanPlatform(platform)} application target`,
    capabilities: [...requirements.deviceCapabilities],
    hasOfflineSupport: requirements.offlineRequirements,
    hasRealtimeSync: requirements.synchronizationRequirements.length > 0,
  };
}

/** Creates the shared service nodes called for by the plan. */
function materialiseServices(graph: ProductGraph, plan: ServicePlan, requirements: EngineeringRequirements): void {
  if (plan.needsAuth) {
    addNode(graph, {
      id: NODE_IDS.auth,
      name: 'Authentication',
      type: 'auth',
      description: 'Shared account and session service used by every target',
      capabilities: requirements.authenticationRequirements.length
        ? [...requirements.authenticationRequirements]
        : ['email'],
    });
  }

  if (plan.needsApi) {
    addNode(graph, {
      id: NODE_IDS.api,
      name: 'API',
      type: 'service',
      description: 'Shared application API',
      capabilities: requirements.realtimeRequirements ? ['rest', 'websocket'] : ['rest'],
    });
  }

  if (plan.needsDatabase) {
    addNode(graph, {
      id: NODE_IDS.database,
      name: 'Database',
      type: 'database',
      description: 'Shared persistent data store',
      capabilities: requirements.databaseRequirements.length ? [...requirements.databaseRequirements] : ['relational'],
    });
  }

  if (plan.needsSync) {
    addNode(graph, {
      id: NODE_IDS.sync,
      name: 'Sync Service',
      type: 'sync',
      description: 'Cross-device synchronisation',
      capabilities: [...requirements.synchronizationRequirements],
    });
  }

  if (plan.needsSharedContracts) {
    addNode(graph, {
      id: NODE_IDS.contracts,
      name: 'Shared Contracts',
      type: 'contract',
      description: 'API request/response schemas shared by every target',
      capabilities: ['api-schema', 'types'],
    });
  }

  if (plan.needsSharedDomain) {
    addNode(graph, {
      id: NODE_IDS.domain,
      name: 'Shared Domain',
      type: 'contract',
      description: 'Domain model and business rules shared by every target',
      capabilities: ['domain-model'],
    });
  }

  // Every product has one visual identity, however many targets it has.
  addNode(graph, {
    id: NODE_IDS.design,
    name: 'Product Design Identity',
    type: 'design',
    description: 'Shared design tokens and component character',
    capabilities: ['tokens', 'typography', 'color', 'motion'],
  });
}

/** Wires one target into whichever shared services exist. */
function connectTarget(graph: ProductGraph, platform: ProjectType, plan: ServicePlan): void {
  const id = targetNodeId(platform);

  if (plan.needsAuth) {
    addRelationship(graph, {
      source: id,
      target: NODE_IDS.auth,
      type: 'SHARES_AUTH',
      description: `${humanPlatform(platform)} signs in against the shared account service`,
    });
  }

  if (plan.needsApi) {
    addRelationship(graph, {
      source: id,
      target: NODE_IDS.api,
      type: 'USES_API',
      description: `${humanPlatform(platform)} reads and writes through the shared API`,
    });
  }

  if (plan.needsSync) {
    addRelationship(graph, {
      source: id,
      target: NODE_IDS.sync,
      type: 'SYNC_WITH',
      description: `${humanPlatform(platform)} synchronises local changes across devices`,
    });
  }

  if (plan.needsSharedContracts) {
    addRelationship(graph, { source: id, target: NODE_IDS.contracts, type: 'SHARES_TYPES' });
  }

  if (plan.needsSharedDomain) {
    addRelationship(graph, { source: id, target: NODE_IDS.domain, type: 'SHARES_DOMAIN' });
  }

  addRelationship(graph, { source: id, target: NODE_IDS.design, type: 'SHARES_DESIGN_SYSTEM' });
}

/** Wires the service-to-service edges. */
function connectServices(graph: ProductGraph, plan: ServicePlan): void {
  if (plan.needsApi && plan.needsDatabase) {
    addRelationship(graph, {
      source: NODE_IDS.api,
      target: NODE_IDS.database,
      type: 'USES_DATABASE',
      description: 'The API is the only writer to the shared database',
    });
  }

  if (plan.needsApi && plan.needsAuth) {
    addRelationship(graph, {
      source: NODE_IDS.api,
      target: NODE_IDS.auth,
      type: 'DEPENDS_ON',
      description: 'The API verifies sessions issued by the auth service',
    });
  }

  if (plan.needsSync && plan.needsApi) {
    addRelationship(graph, {
      source: NODE_IDS.sync,
      target: NODE_IDS.api,
      type: 'USES_API',
      description: 'Sync reconciles through the shared API',
    });
  }

  if (plan.needsApi && plan.needsSharedContracts) {
    addRelationship(graph, { source: NODE_IDS.api, target: NODE_IDS.contracts, type: 'SHARES_TYPES' });
  }
}

/**
 * Builds a complete product family from a set of targets and the requirements
 * that motivated them.
 */
export function createProductFamily(
  productId: string,
  productName: string,
  description: string,
  targetPlatforms: ProjectType[],
  requirements: EngineeringRequirements = createDefaultRequirements(),
): ProductGraph {
  const graph = createProductGraph(productId, productName, description, targetPlatforms);
  const plan = planSharedServices(targetPlatforms, requirements);

  materialiseServices(graph, plan, requirements);

  for (const platform of targetPlatforms) {
    addNode(graph, createTargetNode(platform, requirements));
  }

  for (const platform of targetPlatforms) {
    connectTarget(graph, platform, plan);
  }

  connectServices(graph, plan);

  graph.metadata = { ...graph.metadata, servicePlan: plan };
  graph.verification.lastUpdated = new Date().toISOString();

  return graph;
}

/**
 * Extends an existing product with a new target, reusing every shared service
 * that is already present. Existing targets are left untouched.
 */
export function addTargetToProductFamily(
  graph: ProductGraph,
  newPlatform: ProjectType,
  requirements: EngineeringRequirements = createDefaultRequirements(),
): { graph: ProductGraph; targetNode: ProductNode; reusedServices: string[] } {
  const existing = getNode(graph, targetNodeId(newPlatform));

  if (existing) {
    return { graph, targetNode: existing, reusedServices: [] };
  }

  if (!graph.targetPlatforms.includes(newPlatform)) {
    graph.targetPlatforms.push(newPlatform);
  }

  const targetNode = addNode(graph, createTargetNode(newPlatform, requirements));

  // Reuse whatever the product already has rather than re-planning from scratch.
  const plan: ServicePlan = {
    needsAuth: !!getNode(graph, NODE_IDS.auth),
    needsApi: !!getNode(graph, NODE_IDS.api),
    needsDatabase: !!getNode(graph, NODE_IDS.database),
    needsSync: !!getNode(graph, NODE_IDS.sync),
    needsSharedContracts: !!getNode(graph, NODE_IDS.contracts),
    needsSharedDomain: !!getNode(graph, NODE_IDS.domain),
  };

  connectTarget(graph, newPlatform, plan);

  const reusedServices = [
    NODE_IDS.auth,
    NODE_IDS.api,
    NODE_IDS.database,
    NODE_IDS.sync,
    NODE_IDS.contracts,
    NODE_IDS.domain,
    NODE_IDS.design,
  ].filter((id) => !!getNode(graph, id));

  graph.verification.lastUpdated = new Date().toISOString();
  graph.metadata = { ...graph.metadata, lastModified: new Date().toISOString() };

  return { graph, targetNode, reusedServices };
}

/*
 * ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------
 */

export function getTargetNodes(graph: ProductGraph): ProductNode[] {
  return graph.nodes.filter((n) => n.type === 'target');
}

export function getSharedServices(graph: ProductGraph): ProductNode[] {
  return graph.nodes.filter((n) => n.type !== 'target');
}

export function getRelationshipsByType(graph: ProductGraph, type: RelationshipType): ProductRelationship[] {
  return graph.relationships.filter((r) => r.type === type);
}

export function getRelationshipsForNode(graph: ProductGraph, nodeId: string): ProductRelationship[] {
  return graph.relationships.filter((r) => r.source === nodeId || r.target === nodeId);
}

/** True when the exact (source, type, target) edge exists. */
export function hasRelationship(graph: ProductGraph, source: string, type: RelationshipType, target: string): boolean {
  return graph.relationships.some((r) => r.source === source && r.type === type && r.target === target);
}

export function getProductFamilyRelationships(graph: ProductGraph): ProductRelationship[] {
  return [...graph.relationships];
}

/**
 * Structural validation. Checks that whatever services the graph declares are
 * actually wired to every target — the previous implementation looked for
 * services in a collection they were never stored in, so it always passed.
 */
export function validateProductGraph(graph: ProductGraph): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const targets = getTargetNodes(graph);

  if (targets.length === 0) {
    issues.push('Product graph has no targets');
  }

  // Every relationship must connect nodes that exist.
  for (const rel of graph.relationships) {
    if (!getNode(graph, rel.source)) {
      issues.push(`Relationship ${rel.id} has unknown source "${rel.source}"`);
    }

    if (!getNode(graph, rel.target)) {
      issues.push(`Relationship ${rel.id} has unknown target "${rel.target}"`);
    }
  }

  // Declared targets and target nodes must agree.
  for (const platform of graph.targetPlatforms) {
    if (!getNode(graph, targetNodeId(platform))) {
      issues.push(`Declared target "${platform}" has no node in the graph`);
    }
  }

  const requireEdgeFromEveryTarget = (serviceId: string, type: RelationshipType) => {
    if (!getNode(graph, serviceId)) {
      return;
    }

    for (const target of targets) {
      if (!hasRelationship(graph, target.id, type, serviceId)) {
        issues.push(`Target ${target.id} is missing ${type} to ${serviceId}`);
      }
    }
  };

  requireEdgeFromEveryTarget(NODE_IDS.auth, 'SHARES_AUTH');
  requireEdgeFromEveryTarget(NODE_IDS.api, 'USES_API');
  requireEdgeFromEveryTarget(NODE_IDS.design, 'SHARES_DESIGN_SYSTEM');

  if (getNode(graph, NODE_IDS.sync)) {
    requireEdgeFromEveryTarget(NODE_IDS.sync, 'SYNC_WITH');
  }

  // Data access goes through the API, not straight from the clients.
  if (getNode(graph, NODE_IDS.database)) {
    if (getNode(graph, NODE_IDS.api) && !hasRelationship(graph, NODE_IDS.api, 'USES_DATABASE', NODE_IDS.database)) {
      issues.push('API is not connected to the shared database');
    }

    for (const target of targets) {
      if (hasRelationship(graph, target.id, 'USES_DATABASE', NODE_IDS.database) && getNode(graph, NODE_IDS.api)) {
        issues.push(`Target ${target.id} bypasses the API and talks to the database directly`);
      }
    }
  }

  // Duplicate edges indicate a non-idempotent workflow.
  const seen = new Set<string>();

  for (const rel of graph.relationships) {
    const key = `${rel.source}|${rel.type}|${rel.target}`;

    if (seen.has(key)) {
      issues.push(`Duplicate relationship ${key}`);
    }

    seen.add(key);
  }

  return { valid: issues.length === 0, issues };
}

/** Compact text rendering used by the Product Graph panel and verification output. */
export function describeProductGraph(graph: ProductGraph): string[] {
  return graph.relationships.map((r) => {
    const source = getNode(graph, r.source);
    const target = getNode(graph, r.target);

    return `${source?.name ?? r.source} -> ${r.type} -> ${target?.name ?? r.target}`;
  });
}

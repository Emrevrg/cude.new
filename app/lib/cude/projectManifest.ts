/**
 * Cude.new - Project Manifest (cude.project.json)
 *
 * The versioned, on-disk record of a product's engineering intelligence. It holds
 * enough to resume work on a product later — requirements, per-target stack
 * decisions, the product graph and the design system — and deliberately holds no
 * credentials of any kind.
 */

import type { ProductGraph } from './productGraph';
import type { DesignSystem } from './designSystem';
import type { StackDecision } from './stackIntelligence';
import type { EngineeringRequirements } from './engineeringRequirements';
import type { PlatformAdapter } from './platformAdaptation';

export const MANIFEST_SCHEMA_VERSION = 1;

export const MANIFEST_FILENAME = 'cude.project.json';

export interface TargetManifest {
  platform: string;
  stackId: string;
  stackName: string;
  language: string;
  framework: string;
  hasOfflineSupport: boolean;
  hasRealtimeSync: boolean;

  /** Interaction model this target was adapted to. */
  navigationPattern?: string;
  touchTargetMin?: number;
  density?: string;
}

export interface CudeProjectManifest {
  schemaVersion: number;
  productId: string;
  productName: string;
  description: string;
  prompt: string;
  requirements: EngineeringRequirements;
  targets: TargetManifest[];
  productGraph: ProductGraph;
  stackDecisions: Record<string, StackDecision>;
  designSystem?: DesignSystem;
  verification: {
    lastUpdated: string;
    testedPlatforms: string[];
    buildResults?: Record<string, 'success' | 'failure' | 'skipped'>;
  };
  metadata: {
    createdAt: string;
    lastUpdated: string;
    version: number;
  };
}

/**
 * Keys that must never be written to the manifest, whatever produced them.
 * Enforced on serialization rather than trusted to callers.
 *
 * `token` is matched only in the singular, or with an explicit qualifier such
 * as `access_token`. A bare plural `tokens` is a design-token collection, and
 * matching it silently deleted the design system from every saved project.
 * Credential-shaped *values* are still caught anywhere by SECRET_VALUE_PATTERNS,
 * so narrowing this key match does not weaken the guarantee.
 */
const FORBIDDEN_KEY_PATTERN =
  /^(?:.*[_-])?(?:api[-_]?keys?|apikeys?|secrets?|token|passwords?|passwds?|credentials?|private[-_]?keys?|access[-_]?keys?|auth[-_]?headers?|bearer|session[-_]?ids?)$/i;

/** Value shapes that look like live credentials regardless of their key. */
const SECRET_VALUE_PATTERNS: Array<[string, RegExp]> = [
  ['OpenAI', /\bsk-[A-Za-z0-9]{20,}/],
  ['Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['GitHub', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['Google', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key', /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/],
];

export interface CreateManifestInput {
  productId: string;
  productName: string;
  description: string;
  prompt: string;
  requirements: EngineeringRequirements;
  productGraph: ProductGraph;
  stackDecisions: Record<string, StackDecision>;
  designSystem?: DesignSystem;
  platformAdapters?: Record<string, PlatformAdapter>;
}

export function createManifest(input: CreateManifestInput): CudeProjectManifest {
  const now = new Date().toISOString();

  const targets: TargetManifest[] = input.productGraph.targetPlatforms.map((platform) => {
    const decision = input.stackDecisions[platform];
    const adapter = input.platformAdapters?.[platform];

    return {
      platform,
      stackId: decision?.selected.id ?? '',
      stackName: decision?.selected.name ?? '',
      language: decision?.selected.language ?? '',
      framework: decision?.selected.framework ?? '',
      hasOfflineSupport: decision?.selected.supportsOffline ?? false,
      hasRealtimeSync: decision?.selected.supportsRealtime ?? false,
      navigationPattern: adapter?.navigationPattern,
      touchTargetMin: adapter?.touchTargetMin,
      density: adapter?.density,
    };
  });

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    productId: input.productId,
    productName: input.productName,
    description: input.description,
    prompt: input.prompt,
    requirements: input.requirements,
    targets,
    productGraph: input.productGraph,
    stackDecisions: input.stackDecisions,
    designSystem: input.designSystem,
    verification: {
      lastUpdated: now,
      testedPlatforms: [],
    },
    metadata: {
      createdAt: now,
      lastUpdated: now,
      version: 1,
    },
  };
}

/**
 * Recursively removes anything that looks like a credential.
 *
 * Runs on every serialization, so a manifest can never carry a secret to disk
 * even if some upstream stage put one into the architecture object.
 */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSecrets(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        continue;
      }

      if (typeof inner === 'string' && SECRET_VALUE_PATTERNS.some(([, pattern]) => pattern.test(inner))) {
        continue;
      }

      out[key] = stripSecrets(inner);
    }

    return out as T;
  }

  return value;
}

export function serializeManifest(manifest: CudeProjectManifest): string {
  return JSON.stringify(stripSecrets(manifest), null, 2);
}

export function deserializeManifest(json: string): CudeProjectManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`cude.project.json is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('cude.project.json must contain an object');
  }

  const manifest = parsed as CudeProjectManifest;

  if (manifest.schemaVersion === undefined) {
    throw new Error('cude.project.json is missing schemaVersion');
  }

  if (manifest.schemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `cude.project.json was written by a newer version of Cude (schema ${manifest.schemaVersion}, supported ${MANIFEST_SCHEMA_VERSION})`,
    );
  }

  return manifest;
}

export function updateManifestTarget(
  manifest: CudeProjectManifest,
  platform: string,
  decision: StackDecision,
  graph: ProductGraph,
  adapter?: PlatformAdapter,
): CudeProjectManifest {
  const target: TargetManifest = {
    platform,
    stackId: decision.selected.id,
    stackName: decision.selected.name,
    language: decision.selected.language,
    framework: decision.selected.framework,
    hasOfflineSupport: decision.selected.supportsOffline,
    hasRealtimeSync: decision.selected.supportsRealtime,
    navigationPattern: adapter?.navigationPattern,
    touchTargetMin: adapter?.touchTargetMin,
    density: adapter?.density,
  };

  const targets = [...manifest.targets];
  const index = targets.findIndex((t) => t.platform === platform);

  if (index >= 0) {
    targets[index] = target;
  } else {
    targets.push(target);
  }

  return {
    ...manifest,
    targets,
    stackDecisions: { ...manifest.stackDecisions, [platform]: decision },
    productGraph: graph,
    metadata: {
      ...manifest.metadata,
      lastUpdated: new Date().toISOString(),
      version: manifest.metadata.version + 1,
    },
    verification: { ...manifest.verification, lastUpdated: new Date().toISOString() },
  };
}

export interface ManifestValidation {
  valid: boolean;
  issues: string[];

  /** Populated when credential-shaped content was found. Always a hard failure. */
  secretsFound: string[];
}

export function validateManifest(manifest: CudeProjectManifest): ManifestValidation {
  const issues: string[] = [];
  const secretsFound: string[] = [];

  if (!manifest.productId) {
    issues.push('Missing productId');
  }

  if (!manifest.productName) {
    issues.push('Missing productName');
  }

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    issues.push(`Unexpected schemaVersion ${manifest.schemaVersion}`);
  }

  const json = JSON.stringify(manifest);

  for (const [label, pattern] of SECRET_VALUE_PATTERNS) {
    if (pattern.test(json)) {
      secretsFound.push(label);
      issues.push(`${label} credential found in manifest`);
    }
  }

  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEY_PATTERN.test(key)) {
          secretsFound.push(`${path}.${key}`);
          issues.push(`Credential-shaped field "${key}" at ${path}`);
        }

        walk(inner, `${path}.${key}`);
      }
    }
  };

  walk(manifest, '$');

  for (const target of manifest.targets) {
    if (!manifest.stackDecisions[target.platform]) {
      issues.push(`Target ${target.platform} has no stack decision`);
    }
  }

  for (const platform of manifest.productGraph.targetPlatforms) {
    if (!manifest.targets.some((t) => t.platform === platform)) {
      issues.push(`Graph target ${platform} is not present in manifest targets`);
    }
  }

  return { valid: issues.length === 0, issues, secretsFound };
}

/** The subset of a manifest needed to rebuild a working architecture. */
export function manifestToArchitectureInput(manifest: CudeProjectManifest): {
  requirements: EngineeringRequirements;
  productGraph: ProductGraph;
  stackDecisions: Record<string, StackDecision>;
  designSystem?: DesignSystem;
} {
  return {
    requirements: manifest.requirements,
    productGraph: manifest.productGraph,
    stackDecisions: manifest.stackDecisions,
    designSystem: manifest.designSystem,
  };
}

export function getManifestTargetSummary(manifest: CudeProjectManifest): Array<{
  platform: string;
  stackName: string;
  language: string;
  framework: string;
  capabilities: string[];
}> {
  return manifest.targets.map((t) => ({
    platform: t.platform,
    stackName: t.stackName,
    language: t.language,
    framework: t.framework,
    capabilities: [...(t.hasOfflineSupport ? ['offline'] : []), ...(t.hasRealtimeSync ? ['realtime-sync'] : [])],
  }));
}

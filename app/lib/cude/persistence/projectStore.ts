/**
 * Cude.new - project store.
 *
 * The operations Cude.new performs on a saved product: create it, save it,
 * reload it, list what exists, export it, import it back, evolve it by adding a
 * target, and record a design revision.
 *
 * Every write goes through the manifest's secret stripping. That is enforced
 * here rather than trusted to callers, because the export path is exactly where
 * a leaked provider key would escape the machine.
 */

import {
  createManifest,
  deserializeManifest,
  serializeManifest,
  stripSecrets,
  updateManifestTarget,
  validateManifest,
  MANIFEST_SCHEMA_VERSION,
  type CreateManifestInput,
  type CudeProjectManifest,
} from '~/lib/cude/projectManifest';
import type { StackDecision } from '~/lib/cude/stackIntelligence';
import type { ProductGraph } from '~/lib/cude/productGraph';
import type { PlatformAdapter } from '~/lib/cude/platformAdaptation';
import type { DesignSystem } from '~/lib/cude/designSystem';
import type {
  CudeProject,
  DesignRevision,
  ImportResult,
  ProjectMessage,
  ProjectStorage,
  ProjectSummary,
} from './types';

const KEY_PREFIX = 'project:';

/** Storage key for a project id. */
export function projectKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** Shape written to storage and to an export archive. */
interface SerializedProject {
  schemaVersion: number;
  id: string;
  manifest: CudeProjectManifest;
  messages: ProjectMessage[];
  designRevisions: DesignRevision[];
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput extends CreateManifestInput {
  /** Defaults to the manifest's productId. */
  id?: string;
}

export class CudeProjectStore {
  constructor(private readonly _storage: ProjectStorage) {}

  get storageKind(): string {
    return this._storage.kind;
  }

  /** Build a new project. Not persisted until `save` is called. */
  create(input: CreateProjectInput): CudeProject {
    const manifest = createManifest(input);
    const now = new Date().toISOString();

    return {
      id: input.id ?? manifest.productId,
      manifest,
      messages: [],
      designRevisions: [],
      files: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Persist a project.
   *
   * Secrets are stripped from the whole record, not just the manifest: a
   * provider key pasted into a chat message would otherwise be written to disk
   * and travel into every export.
   */
  async save(project: CudeProject): Promise<CudeProject> {
    const updatedAt = new Date().toISOString();

    const record: SerializedProject = stripSecrets({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: project.id,
      manifest: project.manifest,
      messages: project.messages,
      designRevisions: project.designRevisions,
      files: project.files,
      createdAt: project.createdAt,
      updatedAt,
    });

    await this._storage.set(projectKey(project.id), JSON.stringify(record));

    return { ...project, ...record, manifest: record.manifest };
  }

  /** Load a project, or null when it does not exist. */
  async load(id: string): Promise<CudeProject | null> {
    const raw = await this._storage.get(projectKey(id));

    if (!raw) {
      return null;
    }

    return this._parse(raw).project;
  }

  /** Summaries of every stored project, most recently updated first. */
  async list(): Promise<ProjectSummary[]> {
    const keys = (await this._storage.keys()).filter((k) => k.startsWith(KEY_PREFIX));
    const summaries: ProjectSummary[] = [];

    for (const key of keys) {
      const raw = await this._storage.get(key);

      if (!raw) {
        continue;
      }

      try {
        const { project } = this._parse(raw);
        summaries.push({
          id: project.id,
          productName: project.manifest.productName,
          description: project.manifest.description,
          targetCount: project.manifest.targets.length,
          updatedAt: project.updatedAt,
        });
      } catch {
        // One unreadable record must not make the whole project list fail.
        continue;
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    await this._storage.delete(projectKey(id));
  }

  /** Append conversation messages and persist. */
  async appendMessages(id: string, messages: ProjectMessage[]): Promise<CudeProject> {
    const project = await this._require(id);

    return this.save({ ...project, messages: [...project.messages, ...messages] });
  }

  /** Replace the captured workspace files and persist. */
  async saveFiles(id: string, files: Record<string, string>): Promise<CudeProject> {
    const project = await this._require(id);

    return this.save({ ...project, files });
  }

  /** Add or replace a target, evolving the product onto another platform. */
  async addTarget(
    id: string,
    platform: string,
    decision: StackDecision,
    graph: ProductGraph,
    adapter?: PlatformAdapter,
  ): Promise<CudeProject> {
    const project = await this._require(id);
    const manifest = updateManifestTarget(project.manifest, platform, decision, graph, adapter);

    return this.save({ ...project, manifest });
  }

  /**
   * Record a design revision.
   *
   * Revisions accumulate rather than overwrite: the design review loop needs
   * the history to show what changed between what the user rejected and what
   * they approved.
   */
  async saveDesignRevision(
    id: string,
    designSystem: DesignSystem,
    options: { feedback?: string; approved?: boolean } = {},
  ): Promise<CudeProject> {
    const project = await this._require(id);

    const revision: DesignRevision = {
      revision: project.designRevisions.length + 1,
      designSystem,
      feedback: options.feedback,
      approved: options.approved ?? false,
      createdAt: new Date().toISOString(),
    };

    return this.save({
      ...project,
      designRevisions: [...project.designRevisions, revision],
      manifest: { ...project.manifest, designSystem },
    });
  }

  /** The most recently approved design, if there is one. */
  async approvedDesign(id: string): Promise<DesignRevision | null> {
    const project = await this._require(id);

    for (let i = project.designRevisions.length - 1; i >= 0; i--) {
      if (project.designRevisions[i].approved) {
        return project.designRevisions[i];
      }
    }

    return null;
  }

  /** Serialize a project for export. Never contains credentials. */
  async export(id: string): Promise<string> {
    const project = await this._require(id);

    const record: SerializedProject = stripSecrets({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: project.id,
      manifest: project.manifest,
      messages: project.messages,
      designRevisions: project.designRevisions,
      files: project.files,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    return JSON.stringify(record, null, 2);
  }

  /**
   * Import a serialized project and persist it.
   *
   * Import is the untrusted path — the archive came from outside — so the
   * manifest is validated and problems are reported rather than swallowed.
   */
  async import(serialized: string, options: { id?: string } = {}): Promise<ImportResult> {
    const { project, warnings } = this._parse(serialized);

    const validation = validateManifest(project.manifest);

    if (!validation.valid) {
      warnings.push(...validation.issues.map((issue) => `manifest: ${issue}`));
    }

    if (validation.secretsFound.length > 0) {
      /*
       * Credential-shaped content in an imported archive is a hard failure, not
       * a warning: importing it would write it back to storage.
       */
      throw new Error(`Refusing to import: credential-shaped content found (${validation.secretsFound.join(', ')})`);
    }

    const id = options.id ?? project.id;
    const saved = await this.save({ ...project, id });

    return { project: saved, warnings };
  }

  private async _require(id: string): Promise<CudeProject> {
    const project = await this.load(id);

    if (!project) {
      throw new Error(`No such project: ${id}`);
    }

    return project;
  }

  private _parse(raw: string): { project: CudeProject; warnings: string[] } {
    const warnings: string[] = [];

    let parsed: Partial<SerializedProject>;

    try {
      parsed = JSON.parse(raw) as Partial<SerializedProject>;
    } catch {
      throw new Error('Project record is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.manifest) {
      throw new Error('Project record is missing its manifest');
    }

    if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      warnings.push(
        `Project was written by schema version ${parsed.schemaVersion ?? 'unknown'}; this build expects ${MANIFEST_SCHEMA_VERSION}.`,
      );
    }

    // Round-trip through the manifest codec so its own validation applies.
    const manifest = deserializeManifest(serializeManifest(parsed.manifest as CudeProjectManifest));
    const now = new Date().toISOString();

    return {
      warnings,
      project: {
        id: parsed.id ?? manifest.productId,
        manifest,
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        designRevisions: Array.isArray(parsed.designRevisions) ? parsed.designRevisions : [],
        files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
        createdAt: parsed.createdAt ?? now,
        updatedAt: parsed.updatedAt ?? now,
      },
    };
  }
}

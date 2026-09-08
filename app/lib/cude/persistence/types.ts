/**
 * Cude.new - project persistence contract.
 *
 * Cude.new persists a *product*, not a conversation. The manifest
 * (`cude.project.json`) is the record: requirements, targets, stack decisions,
 * product graph, design system and verification metadata. The conversation is
 * one part of a project, not the thing projects are organised around.
 *
 * The storage backend is an interface so the whole persistence layer — create,
 * save, reload, export, import, add target, design revision — is verifiable in
 * a plain Node process. The inherited layer threaded a raw `IDBDatabase` handle
 * through all seventeen of its exported functions, which made it impossible to
 * exercise anywhere except a browser.
 */

import type { CudeProjectManifest } from '~/lib/cude/projectManifest';
import type { DesignSystem } from '~/lib/cude/designSystem';

/** A stored message in a project's conversation. */
export interface ProjectMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

/** One captured revision of the design contract. */
export interface DesignRevision {
  revision: number;
  designSystem: DesignSystem;

  /** What the user asked to change, when this revision came from feedback. */
  feedback?: string;
  approved: boolean;
  createdAt: string;
}

/** Everything Cude.new keeps for one project. */
export interface CudeProject {
  id: string;
  manifest: CudeProjectManifest;
  messages: ProjectMessage[];
  designRevisions: DesignRevision[];

  /** Workspace-relative path to contents, captured for reload. */
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** Summary shown in a project list without loading the whole record. */
export interface ProjectSummary {
  id: string;
  productName: string;
  description: string;
  targetCount: number;
  updatedAt: string;
}

/**
 * Key/value storage the project store is built on.
 *
 * Deliberately tiny: anything a backend cannot do in three operations does not
 * belong in the persistence contract.
 */
export interface ProjectStorage {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Result of importing a serialized project. */
export interface ImportResult {
  project: CudeProject;

  /** Non-fatal problems found while importing. */
  warnings: string[];
}

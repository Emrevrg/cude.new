/**
 * Cude.new - project persistence.
 *
 * One entry point, one construction path. Nothing here opens a database as a
 * side effect of being imported.
 */

import { CudeProjectStore } from './projectStore';
import { createProjectStorage } from './storage';

export { CudeProjectStore, projectKey, type CreateProjectInput } from './projectStore';
export {
  MemoryProjectStorage,
  IndexedDbProjectStorage,
  createProjectStorage,
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAME,
} from './storage';
export { ConversationStore, conversationKey, slugify } from './conversationStore';
export type { Conversation, ConversationMessage, ConversationMetadata } from './conversationStore';
export { saveSession, loadSession, clearSession, SESSION_KEY, SESSION_SCHEMA_VERSION } from './sessionSnapshot';
export type { SessionSnapshot, SessionSnapshotInput } from './sessionSnapshot';
export type {
  CudeProject,
  ProjectMessage,
  ProjectSummary,
  ProjectStorage,
  DesignRevision,
  ImportResult,
} from './types';

/** Build a store on the backend appropriate for the current environment. */
export function createProjectStore(): CudeProjectStore {
  return new CudeProjectStore(createProjectStorage());
}

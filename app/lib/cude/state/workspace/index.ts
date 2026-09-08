/**
 * Cude.new - workspace state.
 *
 * The model, the synchronisation layer, and the type aliases the UI consumes.
 */

export { WorkspaceFiles, normalizePath, parentPath, ancestorPaths, isInsideFolder } from './fileModel';
export type {
  WorkspaceFileNode,
  WorkspaceFolderNode,
  WorkspaceNode,
  WorkspaceFileMap,
  ModifiedFile,
} from './fileModel';
export { FileSync, isIgnoredPath } from './fileSync';
export { WorkspaceService } from './workspaceService';
export type { WorkspaceServiceOptions } from './workspaceService';
export type { FileSyncOptions, ConflictPolicy, SyncConflict } from './fileSync';

/*
 * Names the file-tree, editor and diff surfaces import. Kept as aliases so
 * those surfaces read naturally while there is a single model behind them.
 */
export type { WorkspaceFileNode as File, WorkspaceFolderNode as Folder, WorkspaceNode as Dirent } from './fileModel';
export type { WorkspaceFileMap as FileMap } from './fileModel';

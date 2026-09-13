import { isWithinWorkspacePath, workspacePath, type WorkspacePath } from './path';

export interface VirtualFile {
  readonly path: WorkspacePath;
  readonly content: string;
  readonly mediaType: string;
}

export interface VirtualWorkspace {
  readonly version: number;
  readonly files: Readonly<Record<string, VirtualFile>>;
}

export interface WriteFileInput {
  readonly path: string;
  readonly content: string;
  readonly mediaType?: string;
}

export function createVirtualWorkspace(initialFiles: readonly WriteFileInput[] = []): VirtualWorkspace {
  return initialFiles.reduce(writeVirtualFile, { version: 0, files: {} });
}

export function writeVirtualFile(workspace: VirtualWorkspace, input: WriteFileInput): VirtualWorkspace {
  const path = workspacePath(input.path);
  const file: VirtualFile = Object.freeze({
    path,
    content: input.content,
    mediaType: input.mediaType?.trim() || 'text/plain',
  });

  const existing = workspace.files[path];

  if (existing?.content === file.content && existing.mediaType === file.mediaType) {
    return workspace;
  }

  return Object.freeze({ version: workspace.version + 1, files: Object.freeze({ ...workspace.files, [path]: file }) });
}

export function readVirtualFile(workspace: VirtualWorkspace, pathInput: string): VirtualFile | undefined {
  return workspace.files[workspacePath(pathInput)];
}

export function deleteVirtualPath(workspace: VirtualWorkspace, pathInput: string): VirtualWorkspace {
  const path = workspacePath(pathInput);
  const retained = Object.fromEntries(
    Object.entries(workspace.files).filter(([candidate]) => !isWithinWorkspacePath(candidate as WorkspacePath, path)),
  );

  if (Object.keys(retained).length === Object.keys(workspace.files).length) {
    return workspace;
  }

  return Object.freeze({ version: workspace.version + 1, files: Object.freeze(retained) });
}

export function moveVirtualPath(workspace: VirtualWorkspace, fromInput: string, toInput: string): VirtualWorkspace {
  const from = workspacePath(fromInput);
  const to = workspacePath(toInput);
  const moving = Object.entries(workspace.files).filter(([candidate]) =>
    isWithinWorkspacePath(candidate as WorkspacePath, from),
  );

  if (moving.length === 0 || from === to) {
    return workspace;
  }

  if (isWithinWorkspacePath(to, from)) {
    throw new Error('A virtual path cannot be moved inside itself.');
  }

  const replacements = moving.map(([candidate, file]) => {
    const suffix = candidate.slice(from.length);
    const nextPath = workspacePath(`${to}${suffix}`);

    return [nextPath, Object.freeze({ ...file, path: nextPath })] as const;
  });
  const movingPaths = new Set(moving.map(([candidate]) => candidate));

  for (const [nextPath] of replacements) {
    if (workspace.files[nextPath] && !movingPaths.has(nextPath)) {
      throw new Error(`Cannot overwrite existing virtual path: ${nextPath}`);
    }
  }

  const files = Object.fromEntries(
    Object.entries(workspace.files).filter(([candidate]) => !movingPaths.has(candidate)),
  );

  for (const [nextPath, file] of replacements) {
    files[nextPath] = file;
  }

  return Object.freeze({ version: workspace.version + 1, files: Object.freeze(files) });
}

export function listVirtualFiles(workspace: VirtualWorkspace, directoryInput = ''): readonly VirtualFile[] {
  const directory = workspacePath(directoryInput, { allowRoot: true });
  return Object.values(workspace.files)
    .filter((file) => isWithinWorkspacePath(file.path, directory))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export class WorkspacePathError extends Error {
  readonly name = 'WorkspacePathError';
}

/** Canonical, workspace-relative path. The empty string denotes the workspace root. */
export type WorkspacePath = string & { readonly __workspacePath: unique symbol };

export function workspacePath(input: string, options: { readonly allowRoot?: boolean } = {}): WorkspacePath {
  if (typeof input !== 'string' || input.includes('\0')) {
    throw new WorkspacePathError('Workspace paths must be valid strings without null bytes.');
  }

  const value = input.trim();

  if (value === '' || value === '.') {
    if (options.allowRoot) {
      return '' as WorkspacePath;
    }

    throw new WorkspacePathError('A file path cannot refer to the workspace root.');
  }

  if (value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value) || value.includes('\\')) {
    throw new WorkspacePathError('Workspace paths must be portable, relative, and use forward slashes.');
  }

  const parts = value.split('/');

  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new WorkspacePathError('Workspace paths cannot contain empty, current, or parent segments.');
  }

  return parts.join('/') as WorkspacePath;
}

export function workspaceRoot(): WorkspacePath {
  return '' as WorkspacePath;
}

export function parentWorkspacePath(path: WorkspacePath): WorkspacePath {
  const boundary = path.lastIndexOf('/');
  return (boundary < 0 ? '' : path.slice(0, boundary)) as WorkspacePath;
}

export function workspaceBasename(path: WorkspacePath): string {
  const boundary = path.lastIndexOf('/');
  return path.slice(boundary + 1);
}

export function isWithinWorkspacePath(candidate: WorkspacePath, directory: WorkspacePath): boolean {
  return directory === '' || candidate === directory || candidate.startsWith(`${directory}/`);
}

import { describe, expect, it } from 'vitest';
import { isWithinWorkspacePath, parentWorkspacePath, workspaceBasename, workspacePath, workspaceRoot } from './path';

describe('workspace paths', () => {
  it('creates portable relative paths and exposes their hierarchy', () => {
    const path = workspacePath('src/features/page.ts');
    expect(path).toBe('src/features/page.ts');
    expect(parentWorkspacePath(path)).toBe('src/features');
    expect(workspaceBasename(path)).toBe('page.ts');
    expect(isWithinWorkspacePath(path, workspacePath('src', { allowRoot: true }))).toBe(true);
    expect(isWithinWorkspacePath(workspacePath('src-old/a.ts'), workspacePath('src', { allowRoot: true }))).toBe(false);
    expect(isWithinWorkspacePath(path, workspaceRoot())).toBe(true);
  });

  it.each(['', '.', '..', '../secret', 'src/../secret', '/etc/passwd', 'C:/secret', 'src\\file.ts', 'src//file.ts'])(
    'rejects unsafe or ambiguous file path %j',
    (path) => expect(() => workspacePath(path)).toThrow(),
  );

  it('only permits an explicit root', () => {
    expect(workspacePath('', { allowRoot: true })).toBe('');
    expect(workspacePath('.', { allowRoot: true })).toBe('');
  });
});

/**
 * Cude.new - runtime selection.
 *
 * One place decides which backend the pipeline talks to. Callers depend on the
 * `CudeRuntime` contract and never on a backend, which is what lets the same
 * orchestration code run in the browser and under the plain-Node verifiers.
 */

import type { CudeRuntime } from './types';
import { MemoryRuntime } from './memoryRuntime';
import { WebContainerRuntime } from './webContainerRuntime';

export type { CudeRuntime, WorkspaceFile, CommandResult, BuildResult, PreviewHandle, ProcessHandle } from './types';
export { MemoryRuntime } from './memoryRuntime';
export { WebContainerRuntime, buildMountTree } from './webContainerRuntime';
export { classifyBuildResult, normalizeWorkspacePath } from './shared';

export interface CreateRuntimeOptions {
  /** Force a backend. Defaults to the browser container when one is possible. */
  prefer?: 'webcontainer' | 'memory';
  workdirName?: string;
}

/** True only where a WebContainer can actually boot. */
export function canUseWebContainer(): boolean {
  return typeof window !== 'undefined' && typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Build the runtime for the current environment.
 *
 * On the server, and anywhere cross-origin isolation is missing, this returns
 * the in-memory runtime rather than a promise that never settles: a caller that
 * asks for a workspace it cannot have should get a usable answer, not a hang.
 */
export async function createRuntime(options: CreateRuntimeOptions = {}): Promise<CudeRuntime> {
  const prefer = options.prefer ?? (canUseWebContainer() ? 'webcontainer' : 'memory');

  if (prefer === 'memory') {
    const runtime = new MemoryRuntime();
    await runtime.initializeWorkspace();

    return runtime;
  }

  const api = await import('@webcontainer/api');

  const runtime = new WebContainerRuntime({
    workdirName: options.workdirName,
    boot: () =>
      api.WebContainer.boot({
        coep: 'credentialless',
        workdirName: options.workdirName,
        forwardPreviewErrors: true,
      }),
  });

  await runtime.initializeWorkspace();

  return runtime;
}

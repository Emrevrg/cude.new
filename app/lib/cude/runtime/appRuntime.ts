/**
 * Cude.new - the application's runtime instance.
 *
 * One place decides which runtime the running product uses, and everything
 * else depends on the `CudeRuntime` contract rather than on a container.
 *
 * Construction is lazy and explicit. Importing this module does not boot
 * anything: the inherited glue booted a container as a side effect of being
 * imported, which meant a server render reached a promise that never settled.
 */

import type { CudeRuntime } from './types';
import { MemoryRuntime } from './memoryRuntime';
import { WebContainerRuntime } from './webContainerRuntime';
import { canUseWebContainer } from './index';

let instance: CudeRuntime | null = null;
let pending: Promise<CudeRuntime> | null = null;

/**
 * The runtime for this environment.
 *
 * In the browser this is the WebContainer-backed runtime. Anywhere a container
 * cannot exist — the server, a test, a verifier — it is the in-memory runtime,
 * so callers get a usable workspace instead of a hang.
 */
export async function getAppRuntime(): Promise<CudeRuntime> {
  if (instance) {
    return instance;
  }

  if (pending) {
    return pending;
  }

  pending = (async () => {
    if (!canUseWebContainer()) {
      if (typeof window !== 'undefined') {
        throw new Error(
          'This browser cannot run the workspace. Open Cude in a current Chromium browser over HTTPS or localhost with cross-origin isolation enabled.',
        );
      }

      const memory = new MemoryRuntime();
      await memory.initializeWorkspace();
      instance = memory;

      return memory;
    }

    const { webcontainer } = await import('~/lib/webcontainer');
    const runtime = new WebContainerRuntime({ boot: () => webcontainer });
    await runtime.initializeWorkspace();
    instance = runtime;

    return runtime;
  })();

  return pending;
}

/** The runtime, if it has already been created. */
export function peekAppRuntime(): CudeRuntime | null {
  return instance;
}

/** Replace the runtime. For tests and the verifiers. */
export function setAppRuntime(runtime: CudeRuntime | null): void {
  instance = runtime;
  pending = null;
}

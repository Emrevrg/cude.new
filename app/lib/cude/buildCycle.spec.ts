/**
 * Cude.new - build cycle behaviour.
 *
 * The self-healing loop is the product's recovery story, so it is verified end
 * to end against a scripted runtime rather than asserted about in prose.
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryRuntime } from './runtime/memoryRuntime';
import { runBuildCycle, DEFAULT_BUILD_COMMANDS } from './buildCycle';
import { MAX_REPAIR_ATTEMPTS } from './build';

const INSTALL = DEFAULT_BUILD_COMMANDS.install;
const BUILD = DEFAULT_BUILD_COMMANDS.build;

async function ready(commands: Record<string, { exitCode?: number; output?: string }>) {
  const runtime = new MemoryRuntime({ commands });
  await runtime.initializeWorkspace();

  return runtime;
}

describe('runBuildCycle', () => {
  it('installs then builds, and reports success', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 0, output: 'added 12 packages' },
      [BUILD]: { exitCode: 0, output: 'built in 1.2s' },
    });

    const result = await runBuildCycle(runtime);

    expect(result.status).toBe('success');
    expect(runtime.invocations).toEqual([INSTALL, BUILD]);
    expect(result.attempts).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });

  it('skips install when the caller says dependencies are unchanged', async () => {
    const runtime = await ready({ [BUILD]: { exitCode: 0 } });

    await runBuildCycle(runtime, { skipInstall: true });

    expect(runtime.invocations).toEqual([BUILD]);
  });

  it('stops at a failed install without spending a repair attempt', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 1, output: 'ERR! package not found' },
      [BUILD]: { exitCode: 0 },
    });
    const onRepair = vi.fn();

    const result = await runBuildCycle(runtime, { onRepair });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Dependency installation failed/);
    expect(runtime.invocations).not.toContain(BUILD);
    expect(onRepair).not.toHaveBeenCalled();
  });

  it('hands a build failure to repair and succeeds on the retry', async () => {
    const runtime = new MemoryRuntime({
      commands: {
        [INSTALL]: { exitCode: 0 },
        [BUILD]: { exitCode: 1, output: 'error TS2304: Cannot find name' },
      },
    });
    await runtime.initializeWorkspace();

    const onRepair = vi.fn(async () => {
      // Repair edited the workspace; the next build now passes.
      (runtime as unknown as { _commands: Record<string, unknown> })._commands[BUILD] = { exitCode: 0, output: 'ok' };
      return true;
    });

    const result = await runBuildCycle(runtime, { onRepair });

    expect(onRepair).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.repaired).toBe(true);
    expect(result.attempts.map((a) => a.succeeded)).toEqual([false, true]);
  });

  it('gives repair the failing output and a classification', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 0 },
      [BUILD]: { exitCode: 1, output: 'Cannot find module "left-pad"' },
    });

    const seen: string[] = [];
    await runBuildCycle(runtime, {
      onRepair: async ({ category, prompt }) => {
        seen.push(category);
        expect(prompt).toContain('left-pad');

        return false;
      },
    });

    expect(seen).toEqual(['dependency']);
  });

  it('stops retrying when repair changed nothing', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 0 },
      [BUILD]: { exitCode: 1, output: 'boom' },
    });

    // Retrying an unchanged workspace reproduces the identical failure.
    const onRepair = vi.fn(async () => false);
    const result = await runBuildCycle(runtime, { onRepair });

    expect(onRepair).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
    expect(result.attempts.filter((a) => a.attempt > 0)).toHaveLength(1);
  });

  it('never exceeds the repair budget', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 0 },
      [BUILD]: { exitCode: 1, output: 'still broken' },
    });

    const onRepair = vi.fn(async () => true);
    const result = await runBuildCycle(runtime, { onRepair });

    expect(result.status).toBe('failed');
    expect(result.attempts.filter((a) => a.attempt > 0)).toHaveLength(MAX_REPAIR_ATTEMPTS);
    expect(onRepair).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS - 1);
  });

  it('reports the stages it moved through', async () => {
    const runtime = await ready({ [INSTALL]: { exitCode: 0 }, [BUILD]: { exitCode: 0 } });

    const statuses: string[] = [];
    await runBuildCycle(runtime, { onStatus: (s) => statuses.push(s) });

    expect(statuses).toEqual(['installing', 'building', 'success']);
  });

  it('streams command output so a terminal can follow along', async () => {
    const runtime = await ready({
      [INSTALL]: { exitCode: 0, output: 'installing...' },
      [BUILD]: { exitCode: 0, output: 'compiling...' },
    });

    const chunks: string[] = [];
    await runBuildCycle(runtime, { onOutput: (c) => chunks.push(c) });

    expect(chunks.join('\n')).toContain('installing...');
    expect(chunks.join('\n')).toContain('compiling...');
  });

  it('fails cleanly when there is no workspace rather than throwing', async () => {
    const runtime = new MemoryRuntime(); // never initialized

    const result = await runBuildCycle(runtime);

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/runtime is not available/i);
  });
});

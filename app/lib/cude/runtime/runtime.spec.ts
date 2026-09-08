/**
 * Cude.new - runtime contract tests.
 *
 * These describe what Cude.new's pipeline requires of a workspace, independent
 * of any backend. Every runtime implementation must satisfy them, so they are
 * written against the CudeRuntime interface rather than against a class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRuntime } from './memoryRuntime';
import { classifyBuildResult, normalizeWorkspacePath } from './shared';
import type { CudeRuntime } from './types';

describe('workspace path normalization', () => {
  it('produces relative POSIX paths', () => {
    expect(normalizeWorkspacePath('src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeWorkspacePath('/src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeWorkspacePath('./src/./App.tsx')).toBe('src/App.tsx');
    expect(normalizeWorkspacePath('src/nested/../App.tsx')).toBe('src/App.tsx');
  });

  it('converts Windows separators, because generated projects use both', () => {
    expect(normalizeWorkspacePath('src\\components\\Nav.tsx')).toBe('src/components/Nav.tsx');
  });

  it('refuses to escape the workspace', () => {
    // Generated project files are untrusted input.
    expect(() => normalizeWorkspacePath('../outside.txt')).toThrow(/escapes the workspace/);
    expect(() => normalizeWorkspacePath('a/../../outside.txt')).toThrow(/escapes the workspace/);
  });

  it('rejects paths that name nothing', () => {
    expect(() => normalizeWorkspacePath('/')).toThrow();
    expect(() => normalizeWorkspacePath('./')).toThrow();
  });
});

describe('build result classification', () => {
  const base = { command: 'pnpm build', output: '', durationMs: 10 };

  it('treats exit 0 as success and attaches no failure kind', () => {
    const result = classifyBuildResult({ ...base, exitCode: 0, aborted: false });

    expect(result.succeeded).toBe(true);
    expect(result).not.toHaveProperty('failureKind');
  });

  it('separates a missing tool from a failing build', () => {
    /*
     * Repair must install a tool in one case and edit source in the other, so
     * collapsing these into "it failed" would send it down the wrong path.
     */
    expect(classifyBuildResult({ ...base, exitCode: 127, aborted: false }).failureKind).toBe('command_not_found');
    expect(
      classifyBuildResult({ ...base, exitCode: 1, output: 'vite: command not found', aborted: false }).failureKind,
    ).toBe('command_not_found');
    expect(classifyBuildResult({ ...base, exitCode: 1, output: 'TS2304', aborted: false }).failureKind).toBe(
      'non_zero_exit',
    );
  });

  it('reports an aborted command as a timeout', () => {
    expect(classifyBuildResult({ ...base, exitCode: 0, aborted: true })).toMatchObject({
      succeeded: false,
      failureKind: 'timeout',
    });
  });
});

describe('CudeRuntime contract', () => {
  let runtime: CudeRuntime & { invocations: string[] };

  beforeEach(() => {
    runtime = new MemoryRuntime();
  });

  it('refuses work before the workspace is initialized', async () => {
    /*
     * Refused, and refused in words a person can act on. This message reached
     * the conversation as "A command failed — Cude runtime used before
     * initializeWorkspace()", which names an internal function and expects the
     * reader to know what one is.
     */
    await expect(runtime.writeFiles([{ path: 'a.txt', contents: 'x' }])).rejects.toThrow(/workspace is not ready/i);
    await expect(runtime.writeFiles([{ path: 'a.txt', contents: 'x' }])).rejects.not.toThrow(
      /initializeWorkspace|undefined|null/,
    );
    expect(runtime.isReady()).toBe(false);
  });

  it('is safe to initialize more than once', async () => {
    await runtime.initializeWorkspace();
    await runtime.initializeWorkspace();
    expect(runtime.isReady()).toBe(true);
  });

  it('mounts a project, replacing anything already there', async () => {
    await runtime.initializeWorkspace();
    await runtime.writeFiles([{ path: 'stale.txt', contents: 'old' }]);
    await runtime.mountProject([
      { path: 'package.json', contents: '{}' },
      { path: 'src/App.tsx', contents: 'export default null;' },
    ]);

    expect(await runtime.listFiles()).toEqual(['package.json', 'src/App.tsx']);
    expect(await runtime.readFile('stale.txt')).toBeNull();
  });

  it('writeFiles adds without clearing, so the Builder can emit incrementally', async () => {
    await runtime.initializeWorkspace();
    await runtime.mountProject([{ path: 'package.json', contents: '{}' }]);
    await runtime.writeFiles([{ path: 'src/App.tsx', contents: 'v1' }]);
    await runtime.writeFiles([{ path: 'src/App.tsx', contents: 'v2' }]);

    expect(await runtime.listFiles()).toEqual(['package.json', 'src/App.tsx']);
    expect(await runtime.readFile('src/App.tsx')).toBe('v2');
  });

  it('reports a missing file as null rather than throwing', async () => {
    await runtime.initializeWorkspace();
    expect(await runtime.readFile('nope.txt')).toBeNull();
  });

  it('streams command output to the caller', async () => {
    runtime = new MemoryRuntime({ commands: { 'pnpm test': { exitCode: 0, output: '4 passed' } } });
    await runtime.initializeWorkspace();

    const chunks: string[] = [];
    const result = await runtime.runCommand('pnpm test', { onOutput: (c) => chunks.push(c) });

    expect(result.exitCode).toBe(0);
    expect(chunks.join('')).toContain('4 passed');
  });

  it('surfaces a failing build to the pipeline with a classification', async () => {
    runtime = new MemoryRuntime({
      commands: { 'pnpm build': { exitCode: 1, output: 'error TS2304: Cannot find name' } },
    });
    await runtime.initializeWorkspace();

    const build = await runtime.collectBuildResult('pnpm build');

    expect(build).toMatchObject({ succeeded: false, exitCode: 1, failureKind: 'non_zero_exit' });
    expect(build.output).toContain('TS2304');
  });

  it('stops a long-running process and marks it aborted', async () => {
    runtime = new MemoryRuntime({ commands: { 'pnpm dev': { longRunning: true, port: 3000 } } });
    await runtime.initializeWorkspace();

    const handle = await runtime.spawn('pnpm dev');
    let settled = false;
    void handle.result.then(() => {
      settled = true;
    });

    expect(settled).toBe(false);

    await runtime.stopProcess(handle.id);

    await expect(handle.result).resolves.toMatchObject({ aborted: true });
  });

  it('ignores a stop for an unknown process', async () => {
    await runtime.initializeWorkspace();
    await expect(runtime.stopProcess('does-not-exist')).resolves.toBeUndefined();
  });

  it('starts a preview and reports where it is served', async () => {
    runtime = new MemoryRuntime({ commands: { 'pnpm dev': { longRunning: true, port: 4321 } } });
    await runtime.initializeWorkspace();

    const preview = await runtime.startPreview('pnpm dev');

    expect(preview).toEqual({ port: 4321, url: 'http://localhost:4321' });
  });

  it('records what the pipeline invoked, in order', async () => {
    await runtime.initializeWorkspace();
    await runtime.runCommand('pnpm install');
    await runtime.runCommand('pnpm build');

    expect(runtime.invocations).toEqual(['pnpm install', 'pnpm build']);
  });

  it('releases everything on dispose', async () => {
    runtime = new MemoryRuntime({ commands: { 'pnpm dev': { longRunning: true } } });
    await runtime.initializeWorkspace();
    await runtime.writeFiles([{ path: 'a.txt', contents: 'x' }]);

    const handle = await runtime.spawn('pnpm dev');
    await runtime.dispose();

    await expect(handle.result).resolves.toMatchObject({ aborted: true });
    expect(runtime.isReady()).toBe(false);
  });
});

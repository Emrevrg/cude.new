/**
 * Cude.new - action execution behaviour.
 *
 * Driven against the in-memory workspace and terminal, so ordering, failure
 * reporting and abort are all verifiable without a container. The ordering
 * tests matter most: running actions concurrently would install dependencies
 * before the manifest that declares them exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { WorkspaceService } from '~/lib/cude/state/workspace/workspaceService';
import { TerminalService } from '~/lib/cude/state/workspace/terminalService';
import { ActionExecutor, resolveWorkspacePath, type ActionFailure } from './actionExecutor';

/*
 * A model writes `filePath="index.html"` and means the workspace root. It is
 * recorded under the absolute path the container's own file watcher reports —
 * one name per file, so a write and the change event that follows it are the
 * same entry rather than two.
 */
const written = resolveWorkspacePath;

async function harness(commands: Record<string, { exitCode?: number; output?: string }> = {}) {
  const runtime = new MemoryRuntime({ commands });
  await runtime.initializeWorkspace();

  const workspace = new WorkspaceService(runtime);
  await workspace.mount([{ path: 'package.json', contents: '{}' }]);

  const terminals = new TerminalService();
  terminals.attachRuntime(runtime);

  const failures: ActionFailure[] = [];
  const executor = new ActionExecutor({
    workspace,
    terminals,
    onFailure: (f) => failures.push(f),
  });

  return { runtime, workspace, terminals, executor, failures };
}

describe('file actions', () => {
  it('writes a file into the workspace', async () => {
    const { executor, workspace } = await harness();
    executor.add('a1', { type: 'file', filePath: 'src/App.tsx', content: 'export default null;' });
    await executor.run('a1');

    expect(workspace.getFile(written('src/App.tsx'))?.content).toBe('export default null;');
    expect(executor.actions.get().a1.status).toBe('complete');
  });

  it('writes streaming content without completing the action', async () => {
    const { executor, workspace } = await harness();
    executor.add('a1', { type: 'file', filePath: 'a.ts', content: 'partial' });
    await executor.run('a1', { streaming: true });

    expect(workspace.getFile(written('a.ts'))?.content).toBe('partial');
    expect(executor.actions.get().a1.status).toBe('pending');
  });

  it('reports a file action with no path rather than writing nowhere', async () => {
    const { executor, failures } = await harness();
    executor.add('a1', { type: 'file', content: 'x' });
    await executor.run('a1');

    expect(failures[0].description).toMatch(/no path/i);
  });

  it('reports a write blocked by a lock instead of failing silently', async () => {
    /*
     * A file that silently did not change would make the next stage act on code
     * that is not there.
     */
    const { executor, workspace, failures } = await harness();
    await workspace.saveFile(written('locked.ts'), 'original');
    workspace.lock(written('locked.ts'));

    executor.add('a1', { type: 'file', filePath: 'locked.ts', content: 'overwrite' });
    await executor.run('a1');

    expect(failures[0].description).toMatch(/locked/i);
    expect(workspace.getFile(written('locked.ts'))?.content).toBe('original');
  });

  it('ignores a streaming update for a non-file action', async () => {
    const { executor } = await harness();
    executor.add('a1', { type: 'shell', content: 'pnpm i' });
    await executor.run('a1', { streaming: true });

    expect(executor.actions.get().a1.status).toBe('pending');
  });
});

describe('command actions', () => {
  it('runs a shell command and records its output', async () => {
    const { executor } = await harness({ 'pnpm install': { exitCode: 0, output: 'added 12' } });
    executor.add('a1', { type: 'shell', content: 'pnpm install' });
    await executor.run('a1');

    expect(executor.actions.get().a1).toMatchObject({ status: 'complete', exitCode: 0 });
    expect(executor.actions.get().a1.output).toContain('added 12');
  });

  it('reports a failing command with its real output', async () => {
    const { executor, failures } = await harness({
      'pnpm build': { exitCode: 2, output: 'error TS2304: Cannot find name' },
    });
    executor.add('a1', { type: 'build', content: 'pnpm build' });
    await executor.run('a1');

    expect(executor.actions.get().a1.status).toBe('failed');
    expect(failures[0]).toMatchObject({ type: 'build', exitCode: 2 });
    expect(failures[0].output).toContain('TS2304');
  });

  it('completes a start action only when the server is ready', async () => {
    const { executor, runtime } = await harness({ 'pnpm dev': { longRunning: true } as never });
    executor.add('a1', { type: 'start', content: 'pnpm dev' });

    const run = executor.run('a1');
    await vi.waitFor(() => expect(runtime.invocations).toContain('pnpm dev'));
    expect(executor.actions.get().a1.status).toBe('running');
    runtime.emitPreviewChange({ kind: 'ready', port: 5173, url: 'http://localhost:5173' });
    await run;
    expect(executor.actions.get().a1.status).toBe('complete');
  });

  it('reports a dev server that fails before readiness', async () => {
    const { executor, failures } = await harness({ 'pnpm dev': { exitCode: 1, output: 'vite: command not found' } });
    executor.add('a1', { type: 'start', content: 'pnpm dev' });
    await executor.run('a1');
    expect(executor.actions.get().a1.status).toBe('failed');
    expect(failures[0].description).toContain('vite: command not found');
  });

  it('reports a timeout as a failure with actionable output', async () => {
    const { executor, terminals, failures } = await harness();
    vi.spyOn(terminals, 'execute').mockResolvedValue({
      command: 'npm install',
      exitCode: 124,
      output: 'Network request timed out',
      durationMs: 180000,
      aborted: true,
      timedOut: true,
    });
    executor.add('a1', { type: 'shell', content: 'npm install' });
    await executor.run('a1');
    expect(executor.actions.get().a1.status).toBe('failed');
    expect(failures[0].output).toContain('Network request timed out');
  });

  it('reports an unsupported action type', async () => {
    const { executor, failures } = await harness();
    executor.add('a1', { type: 'teleport' as never, content: 'x' });
    await executor.run('a1');

    expect(failures[0].description).toMatch(/Unsupported action type/);
  });
});

describe('ordering', () => {
  it('does not start a server after dependency installation failed', async () => {
    const { executor, terminals } = await harness({ 'npm install': { exitCode: 1, output: 'network unavailable' } });
    const start = vi.spyOn(terminals, 'startPreview');
    executor.add('install', { type: 'shell', content: 'npm install' });
    executor.add('start', { type: 'start', content: 'npm run dev' });
    await Promise.all([executor.run('install'), executor.run('start')]);
    expect(executor.actions.get().install.status).toBe('failed');
    expect(executor.actions.get().start.status).toBe('aborted');
    expect(start).not.toHaveBeenCalled();
  });
  it('runs actions in the order they were added', async () => {
    const { runtime, executor } = await harness({
      'pnpm install': { exitCode: 0 },
      'pnpm build': { exitCode: 0 },
    });

    executor.add('a1', { type: 'file', filePath: 'package.json', content: '{"name":"x"}' });
    executor.add('a2', { type: 'shell', content: 'pnpm install' });
    executor.add('a3', { type: 'build', content: 'pnpm build' });

    // Queued together, the way a parsed artifact delivers them.
    await Promise.all([executor.run('a1'), executor.run('a2'), executor.run('a3')]);

    expect(runtime.invocations).toEqual(['pnpm install', 'pnpm build']);
  });

  it('writes the manifest before the install that reads it', async () => {
    const { runtime, workspace, executor } = await harness({ 'pnpm install': { exitCode: 0 } });

    executor.add('a1', { type: 'file', filePath: 'package.json', content: '{"deps":true}' });
    executor.add('a2', { type: 'shell', content: 'pnpm install' });

    const first = executor.run('a1');
    const second = executor.run('a2');
    await Promise.all([first, second]);

    // The container's filesystem is rooted at the workspace, so it takes the relative name.
    expect(await runtime.readFile('package.json')).toBe('{"deps":true}');
    expect(workspace.getFile(written('package.json'))?.content).toBe('{"deps":true}');
  });

  it('runs an action only once even if asked twice', async () => {
    const { runtime, executor } = await harness({ 'pnpm i': { exitCode: 0 } });
    executor.add('a1', { type: 'shell', content: 'pnpm i' });

    await executor.run('a1');
    await executor.run('a1');

    expect(runtime.invocations.filter((c) => c === 'pnpm i')).toHaveLength(1);
  });

  it('ignores a run for an action that was never added', async () => {
    const { executor } = await harness();

    await expect(executor.run('nope')).resolves.toBeUndefined();
  });
});

describe('registration', () => {
  it('records an action as pending', async () => {
    const { executor } = await harness();
    executor.add('a1', { type: 'shell', content: 'pnpm i' });

    expect(executor.actions.get().a1.status).toBe('pending');
  });

  it('updates the content of an action that is already running', async () => {
    const { executor } = await harness();
    executor.add('a1', { type: 'file', filePath: 'a.ts', content: 'v1' });
    await executor.run('a1');
    executor.add('a1', { type: 'file', filePath: 'a.ts', content: 'v2' });

    expect(executor.actions.get().a1.content).toBe('v2');
    expect(executor.actions.get().a1.status).toBe('complete');
  });

  it('notifies a subscriber on every state change', async () => {
    const runtime = new MemoryRuntime({ commands: { 'pnpm i': { exitCode: 0 } } });
    await runtime.initializeWorkspace();

    const workspace = new WorkspaceService(runtime);
    await workspace.mount([]);

    const terminals = new TerminalService();
    terminals.attachRuntime(runtime);

    const onChange = vi.fn();
    const executor = new ActionExecutor({ workspace, terminals, onChange });

    executor.add('a1', { type: 'shell', content: 'pnpm i' });
    await executor.run('a1');

    const statuses = onChange.mock.calls.map((call) => call[1].status);

    expect(statuses).toContain('pending');
    expect(statuses).toContain('running');
    expect(statuses).toContain('complete');
  });
});

describe('abort', () => {
  it('refuses late file chunks after cancellation', async () => {
    const { executor, workspace } = await harness();
    executor.abort();
    executor.add('late', { type: 'file', filePath: 'late.txt', content: 'late chunk' });
    await executor.run('late', { streaming: true });
    expect(executor.actions.get().late.status).toBe('aborted');
    expect(workspace.getFile(written('late.txt'))).toBeUndefined();
  });
  it('marks pending actions aborted', async () => {
    const { executor } = await harness();
    executor.add('a1', { type: 'shell', content: 'pnpm i' });
    executor.abort();

    expect(executor.actions.get().a1.status).toBe('aborted');
  });

  it('does not run an action queued after an abort', async () => {
    const { runtime, executor } = await harness({ 'pnpm i': { exitCode: 0 } });
    executor.add('a1', { type: 'shell', content: 'pnpm i' });
    executor.abort();
    await executor.run('a1');

    expect(runtime.invocations).not.toContain('pnpm i');
  });

  it('leaves a completed action alone', async () => {
    const { executor } = await harness({ 'pnpm i': { exitCode: 0 } });
    executor.add('a1', { type: 'shell', content: 'pnpm i' });
    await executor.run('a1');
    executor.abort();

    expect(executor.actions.get().a1.status).toBe('complete');
  });
});

/**
 * Cude.new - terminal session behaviour.
 *
 * Driven against the scripted runtime, so session lifecycle, the command
 * bridge, cancellation and disposal are all verifiable without a container.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { TerminalService, shellFailureMessage, WorkspaceNotReadyError, type TerminalView } from './terminalService';

function fakeView(cols = 100, rows = 30) {
  const written: string[] = [];
  let dataHandler: ((data: string) => void) | undefined;

  const view: TerminalView & { written: string[]; type: (s: string) => void } = {
    cols,
    rows,
    written,
    write: (data) => written.push(data),
    onData: (handler) => {
      dataHandler = handler;
    },
    type: (s) => dataHandler?.(s),
  };

  return view;
}

async function service(commands: Record<string, { exitCode?: number; output?: string }> = {}) {
  const runtime = new MemoryRuntime({ commands });
  await runtime.initializeWorkspace();

  const terminals = new TerminalService();
  terminals.attachRuntime(runtime);

  return { runtime, terminals };
}

describe('visibility', () => {
  it('starts visible and toggles', () => {
    const terminals = new TerminalService();

    expect(terminals.visible.get()).toBe(true);

    terminals.toggle();
    expect(terminals.visible.get()).toBe(false);

    terminals.toggle(true);
    expect(terminals.visible.get()).toBe(true);
  });
});

describe('attached terminals', () => {
  let terminals: TerminalService;

  beforeEach(async () => {
    ({ terminals } = await service());
  });

  it('binds a view to a shell', async () => {
    const view = fakeView();

    expect(await terminals.attach(view)).toBe(true);
    expect(terminals.attachedCount).toBe(1);
  });

  it('sends what the user types into the shell', async () => {
    const view = fakeView();
    await terminals.attach(view);

    view.type('ls\n');

    // The scripted shell echoes input back, which is what the view renders.
    expect(view.written.join('')).toContain('ls');
  });

  it('releases the session when a view detaches', async () => {
    const view = fakeView();
    await terminals.attach(view);
    await terminals.detach(view);

    expect(terminals.attachedCount).toBe(0);
  });

  it('ignores a detach for a view that was never attached', async () => {
    await expect(terminals.detach(fakeView())).resolves.toBeUndefined();
  });

  it('writes the state into the terminal rather than throwing', async () => {
    const orphan = new TerminalService(); // the workspace has not booted yet
    const view = fakeView();

    expect(await orphan.attach(view)).toBe(false);
    expect(view.written.join('')).toContain('The workspace is still starting');
  });

  it('gives a terminal its shell once the workspace arrives', async () => {
    /*
     * A view that asked while the container was still booting was told so and
     * never told anything again — reopening a saved conversation left a
     * terminal reading "still starting" forever, with the files beside it
     * loaded perfectly. Nothing retried, because nothing was watching.
     */
    const late = new TerminalService();
    const view = fakeView();

    expect(await late.attach(view)).toBe(false);
    expect(view.written.join('')).toContain('still starting');
    expect(late.attachedCount).toBe(0);

    const runtime = new MemoryRuntime();
    await runtime.initializeWorkspace();
    late.attachRuntime(runtime);

    // The retry is scheduled, not awaited by attachRuntime.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(late.attachedCount, 'the waiting terminal never got a shell').toBe(1);
  });

  it('does not retry a terminal that genuinely failed', async () => {
    // Or a broken shell would be reattached on every runtime change, forever.
    const broken = new TerminalService();
    const runtime = new MemoryRuntime();
    await runtime.initializeWorkspace();
    vi.spyOn(runtime, 'openShell').mockRejectedValue(new Error('spawn /bin/jsh ENOENT'));
    broken.attachRuntime(runtime);

    const view = fakeView();
    expect(await broken.attach(view)).toBe(false);

    broken.attachRuntime(runtime);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(broken.attachedCount).toBe(0);
  });

  it('does not describe a workspace that is merely starting as broken', () => {
    /*
     * Booting the container takes seconds, and anything reaching the terminal
     * in that window is early, not broken. This said "Terminal service has no
     * runtime" — internal wording for an ordinary state — so a screenshot of a
     * healthy workspace read as a bug report.
     */
    const starting = shellFailureMessage(new WorkspaceNotReadyError());

    expect(starting).toContain('still starting');
    expect(starting).not.toMatch(/no runtime|failed|error/i);
  });

  it('still says plainly when a shell genuinely could not start', () => {
    const broken = shellFailureMessage(new Error('spawn /bin/jsh ENOENT'));

    expect(broken).toContain('No shell is running in this workspace yet');
    expect(broken, 'the reason has to survive, or nothing is diagnosable').toContain('ENOENT');
  });

  it('formats a failure message from any thrown value', () => {
    expect(shellFailureMessage(new Error('boom'))).toContain('boom');
    expect(shellFailureMessage('plain string')).toContain('plain string');
  });
});

describe('command shell', () => {
  it('opens only one shell when two callers arrive together', async () => {
    const { terminals, runtime } = await service();
    const open = vi.spyOn(runtime, 'openShell');
    const [first, second] = await Promise.all([terminals.openCommandShell(), terminals.openCommandShell()]);
    expect(first).toBe(second);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('bounds a hung command, retains output, and replaces the stopped shell', async () => {
    const { terminals } = await service();
    const shell = (await terminals.openCommandShell())!;
    const kill = vi.spyOn(shell, 'kill');
    vi.spyOn(shell, 'execute').mockImplementation(() => {
      shell.write('Downloading packages...');
      return new Promise(() => {
        /* deliberately never resolves: simulate a stalled runtime */
      });
    });

    const result = await terminals.execute('npm install', { timeoutMs: 25 });
    expect(result).toMatchObject({ aborted: true, timedOut: true, exitCode: 124 });
    expect(result.output).toContain('Downloading packages...');
    expect(result.output).toContain('timed out');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(await terminals.openCommandShell()).not.toBe(shell);
    expect((await terminals.execute('echo recovered')).exitCode).toBe(0);
  });

  it('settles cancellation even when the runtime ignores AbortSignal', async () => {
    const { terminals } = await service();
    const shell = (await terminals.openCommandShell())!;
    const execute = vi.spyOn(shell, 'execute').mockImplementation(
      () =>
        new Promise(() => {
          /* deliberately never resolves: simulate a stalled runtime */
        }),
    );
    const controller = new AbortController();
    const pending = terminals.execute('npm install', { signal: controller.signal });
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    controller.abort();
    expect(await pending).toMatchObject({ exitCode: 130, aborted: true, timedOut: false });
  });

  it('never executes a command cancelled before submission', async () => {
    const { terminals, runtime } = await service();
    const controller = new AbortController();
    controller.abort();
    expect(await terminals.execute('npm install', { signal: controller.signal })).toMatchObject({ aborted: true });
    expect(runtime.invocations).toEqual([]);
  });

  it('reuses one shell across commands', async () => {
    const { terminals } = await service();

    const first = await terminals.openCommandShell();
    const second = await terminals.openCommandShell();

    expect(first).toBe(second);
    expect(terminals.commandShellReady.get()).toBe(true);
  });

  it('runs a command and reports its exit code', async () => {
    const { terminals } = await service({ 'pnpm build': { exitCode: 0, output: 'built' } });

    const result = await terminals.execute('pnpm build');

    expect(result).toMatchObject({ exitCode: 0, aborted: false });
    expect(result.output).toContain('built');
  });

  it('reports a failing command rather than throwing', async () => {
    const { terminals } = await service({ 'pnpm build': { exitCode: 2, output: 'error TS2304' } });

    const result = await terminals.execute('pnpm build');

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('TS2304');
  });

  it('reports a usable result when no shell can be opened', async () => {
    // A pipeline stage must always get something it can classify.
    const orphan = new TerminalService();

    const result = await orphan.execute('pnpm build');

    expect(result).toMatchObject({ exitCode: -1, aborted: false });
    expect(result.output).toMatch(/No shell is available/);
  });

  it('keeps the command shell separate from attached terminals', async () => {
    const { terminals } = await service();
    const view = fakeView();
    await terminals.attach(view);
    await terminals.openCommandShell();

    // Interleaving the two would make an exit code ambiguous.
    expect(terminals.attachedCount).toBe(1);
    expect(terminals.commandShellReady.get()).toBe(true);
  });
});

describe('action runner handle', () => {
  it('becomes usable once ready resolves', async () => {
    const { terminals } = await service();
    const handle = terminals.commandShellHandle();

    expect(handle.terminal).toBe(false);

    await handle.ready();

    expect(handle.terminal).toBe(true);
    expect(handle.process).toBe(true);
  });

  it('runs a command and reports the exit code', async () => {
    const { terminals } = await service({ 'pnpm test': { exitCode: 0, output: '4 passed' } });
    const handle = terminals.commandShellHandle();
    await handle.ready();

    const result = await handle.executeCommand('session-1', 'pnpm test');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('4 passed');
  });

  it('surfaces a non-zero exit code to the runner', async () => {
    const { terminals } = await service({ 'pnpm test': { exitCode: 1, output: '1 failed' } });
    const handle = terminals.commandShellHandle();
    await handle.ready();

    expect((await handle.executeCommand('s', 'pnpm test')).exitCode).toBe(1);
  });
});

describe('resize and disposal', () => {
  it('forwards a resize to attached shells', async () => {
    const { runtime, terminals } = await service();
    const view = fakeView(80, 24);
    await terminals.attach(view);

    terminals.resize({ cols: 120, rows: 40 });

    const shells = [...Array(5).keys()].map((i) => runtime.shellState(`shell-${i + 1}`)).filter(Boolean);

    expect(shells.some((s) => s!.size.cols === 120 && s!.size.rows === 40)).toBe(true);
  });

  it('seeds the shell with the view size', async () => {
    const { runtime, terminals } = await service();
    await terminals.attach(fakeView(133, 44));

    const shells = [...Array(5).keys()].map((i) => runtime.shellState(`shell-${i + 1}`)).filter(Boolean);

    expect(shells.some((s) => s!.size.cols === 133)).toBe(true);
  });

  it('ends every session on dispose', async () => {
    const { terminals } = await service();
    await terminals.attach(fakeView());
    await terminals.openCommandShell();

    await terminals.dispose();

    expect(terminals.attachedCount).toBe(0);
    expect(terminals.commandShellReady.get()).toBe(false);
  });

  it('is safe to dispose twice', async () => {
    const { terminals } = await service();
    await terminals.dispose();

    await expect(terminals.dispose()).resolves.toBeUndefined();
  });

  it('refuses to attach after disposal', async () => {
    const { terminals } = await service();
    await terminals.dispose();

    expect(await terminals.attach(fakeView())).toBe(false);
  });
});

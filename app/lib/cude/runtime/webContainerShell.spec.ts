import { describe, it, expect, vi } from 'vitest';
import type { WebContainer } from '@webcontainer/api';
import { WebContainerRuntime } from './webContainerRuntime';

async function harness() {
  let output!: ReadableStreamDefaultController<string>;
  let end!: (code: number) => void;
  const writes: string[] = [];
  const process = {
    output: new ReadableStream<string>({
      start(controller) {
        output = controller;
      },
    }),
    input: new WritableStream<string>({
      write(chunk) {
        writes.push(chunk);
      },
    }),
    exit: new Promise<number>((resolve) => {
      end = resolve;
    }),
    kill: vi.fn(() => end(130)),
    resize: vi.fn(),
  };
  const container = { spawn: vi.fn(async () => process), on: vi.fn(() => () => undefined) } as unknown as WebContainer;
  const runtime = new WebContainerRuntime({ boot: async () => container });
  await runtime.initializeWorkspace();

  const shell = await runtime.openShell();

  return { shell, writes, output, end, process };
}

describe('WebContainer shell lifecycle', () => {
  it('waits for a fragmented prompt and reads fragmented command completion', async () => {
    const { shell, writes, output } = await harness();
    const pending = shell.execute('npm install');
    output.enqueue('\x1b]654;pro');
    output.enqueue('mpt\x07');
    await vi.waitFor(() => expect(writes).toEqual(['npm install\n']));
    output.enqueue('\x1b]654;pid=7\x07added 12 packages\n\x1b]654;ex');
    output.enqueue('it=7:0\x07');
    expect(await pending).toMatchObject({ exitCode: 0, output: 'added 12 packages', aborted: false });
    await shell.kill();
  });

  it('cancels before the first prompt without submitting the command', async () => {
    const { shell, writes } = await harness();
    const controller = new AbortController();
    const pending = shell.execute('npm install', { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ exitCode: 130, aborted: true });
    expect(writes).toEqual([]);
    await shell.kill();
  });

  it('settles if the shell exits before showing a prompt', async () => {
    const { shell, end } = await harness();
    const pending = shell.execute('npm install');
    end(1);
    await expect(pending).rejects.toThrow('Shell session has ended');
  });

  it('removes abort listeners after successful execution', async () => {
    const { shell, output, writes } = await harness();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    output.enqueue('\x1b]654;prompt\x07');

    const pending = shell.execute('echo hello', { signal: controller.signal });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    output.enqueue('\x1b]654;pid=2\x07hello\n\x1b]654;exit=2:0\x07');
    await pending;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    expect(writes).toEqual(['echo hello\n']);
    await shell.kill();
  });
});

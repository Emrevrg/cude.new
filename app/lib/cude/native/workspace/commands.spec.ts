import { describe, expect, it } from 'vitest';
import { commandRequest, commandResult, FakeCommandExecutor } from './commands';

describe('command contracts', () => {
  it('creates a shell-independent request without joining arguments', () => {
    const request = commandRequest({
      id: 'test-1',
      executable: 'pnpm',
      args: ['vitest', '--run', 'a file.spec.ts'],
      cwd: 'packages/app',
      env: { CI: 'true' },
    });
    expect(request).toMatchObject({ cwd: 'packages/app', timeoutMs: 120_000 });
    expect(request.args).toEqual(['vitest', '--run', 'a file.spec.ts']);
  });

  it.each([
    { id: '', executable: 'node' },
    { id: 'x', executable: '' },
    { id: 'x', executable: 'node', cwd: '../outside' },
    { id: 'x', executable: 'node', env: { 'BAD-KEY': 'value' } },
    { id: 'x', executable: 'node', timeoutMs: 0 },
  ])('rejects an invalid request %#', (input) => expect(() => commandRequest(input)).toThrow());

  it('enforces result invariants', () => {
    const request = commandRequest({ id: 'build', executable: 'build' });
    expect(() =>
      commandResult(request, { status: 'completed', exitCode: 1, stdout: '', stderr: '', durationMs: 1 }),
    ).toThrow();
    expect(() =>
      commandResult(request, { status: 'failed', exitCode: 0, stdout: '', stderr: '', durationMs: 1 }),
    ).toThrow();
  });

  it('provides a deterministic executor test double', async () => {
    const executor = new FakeCommandExecutor();
    executor.enqueue({ status: 'completed', exitCode: 0, stdout: 'ok', stderr: '', durationMs: 4 });

    const request = commandRequest({ id: 'lint', executable: 'eslint' });
    await expect(executor.execute(request)).resolves.toMatchObject({ requestId: 'lint', stdout: 'ok' });
    expect(executor.requests).toEqual([request]);
    await expect(executor.execute(request)).rejects.toThrow(/no fake command result/i);
  });

  it('returns cancellation without consuming a queued result', async () => {
    const executor = new FakeCommandExecutor();
    executor.enqueue({ status: 'completed', exitCode: 0, stdout: 'later', stderr: '', durationMs: 2 });

    const request = commandRequest({ id: 'cancel', executable: 'test' });
    const controller = new AbortController();
    controller.abort();
    await expect(executor.execute(request, controller.signal)).resolves.toMatchObject({ status: 'cancelled' });
    await expect(executor.execute(request)).resolves.toMatchObject({ stdout: 'later' });
  });
});

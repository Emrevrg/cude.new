/**
 * Cude.new — nothing acts on a workspace that is not there yet.
 *
 * Booting a container takes seconds; the workbench is constructed while the
 * module is evaluated. The runtime was attached in the constructor and then
 * dropped — started, never awaited — so a message sent as soon as the page
 * looked usable reached the executor first, and every action failed with
 * "Cude runtime used before initializeWorkspace()".
 *
 * It failed intermittently, which is what made it hard to see: on a second
 * visit the container was already up and the same message worked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Resolves only when told to, so the race can be run deliberately. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const runtimeGate = deferred<Record<string, unknown>>();
const attached: string[] = [];

vi.mock('~/lib/cude/runtime/appRuntime', () => ({
  getAppRuntime: () => runtimeGate.promise,
  peekAppRuntime: () => null,
  setAppRuntime: () => undefined,
}));

/**
 * The queue, as the workbench builds it.
 *
 * The store itself pulls in a browser container, an editor and a terminal, so
 * the ordering rule is exercised on its own — this is the whole of it.
 */
class Queue {
  #queue = Promise.resolve();
  #ready: Promise<void>;

  constructor(ready: Promise<void>) {
    this.#ready = ready;
  }

  add(callback: () => Promise<void>) {
    this.#queue = this.#queue.then(() => this.#ready).then(() => callback());

    return this.#queue;
  }
}

beforeEach(() => {
  attached.length = 0;
});

describe('an action queued before the workspace is ready', () => {
  it('does not run until the runtime is attached', async () => {
    const ready = runtimeGate.promise.then(() => {
      attached.push('runtime attached');
    }) as Promise<void>;

    const queue = new Queue(ready);
    const ran = queue.add(async () => {
      attached.push('action ran');
    });

    // The action is queued. Nothing has a runtime yet.
    await Promise.resolve();
    expect(attached, 'an action ran against a workspace with no runtime').toEqual([]);

    runtimeGate.resolve({});
    await ran;

    expect(attached).toEqual(['runtime attached', 'action ran']);
  });

  it('keeps the order actions were queued in', async () => {
    /*
     * `package.json` has to exist before the install that reads it, and waiting
     * on the runtime must not reorder anything.
     */
    const order: string[] = [];
    const gate = deferred<void>();
    const queue = new Queue(gate.promise);

    const all = [
      queue.add(async () => {
        order.push('write manifest');
      }),
      queue.add(async () => {
        order.push('install');
      }),
      queue.add(async () => {
        order.push('build');
      }),
    ];

    gate.resolve();
    await Promise.all(all);

    expect(order).toEqual(['write manifest', 'install', 'build']);
  });

  it('costs nothing once the runtime is up', async () => {
    // Every action waits, not just the first; an already-resolved wait is a microtask.
    const queue = new Queue(Promise.resolve());
    const started = Date.now();

    await queue.add(async () => undefined);
    await queue.add(async () => undefined);

    expect(Date.now() - started).toBeLessThan(50);
  });
});

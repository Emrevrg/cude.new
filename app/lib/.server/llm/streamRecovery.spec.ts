/**
 * Cude.new — telling a model thinking apart from a stream that has stalled.
 *
 * Both look identical from here: nothing arriving. But a reasoning model puts
 * nothing on the wire while it reasons, and that can take minutes — NVIDIA's
 * Kimi K3 does exactly this. Given one allowance for both, it was cut off
 * part-way through building a page, and the turn ended with the project's
 * files created and completely empty.
 *
 * Once tokens are arriving, a long gap does mean something is wrong.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { StreamRecoveryManager } from './stream-recovery';

afterEach(() => {
  vi.useRealTimers();
});

describe('waiting for a provider', () => {
  it('waits longer for the first token than for the next one', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({
      firstTokenTimeout: 400_000,
      timeout: 100_000,
      onTimeout,
    });

    manager.startMonitoring();

    // Well past the between-chunks allowance, still thinking.
    vi.advanceTimersByTime(150_000);
    expect(onTimeout, 'a thinking model was cut off').not.toHaveBeenCalled();

    vi.advanceTimersByTime(300_000);
    expect(onTimeout, 'it never gives up at all').toHaveBeenCalled();

    manager.stop();
  });

  it('tightens once the answer has started', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({
      firstTokenTimeout: 400_000,
      timeout: 100_000,
      onTimeout,
    });

    manager.startMonitoring();
    manager.updateActivity();

    vi.advanceTimersByTime(150_000);
    expect(onTimeout, 'a stalled stream was left running').toHaveBeenCalled();

    manager.stop();
  });

  it('falls back to one allowance when only one is given', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({ timeout: 50_000, onTimeout });

    manager.startMonitoring();
    vi.advanceTimersByTime(60_000);

    expect(onTimeout).toHaveBeenCalled();
    manager.stop();
  });

  it('stops watching when told to', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({ timeout: 10_000, onTimeout });

    manager.startMonitoring();
    manager.stop();
    vi.advanceTimersByTime(60_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});

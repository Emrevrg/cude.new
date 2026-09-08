import { afterEach, describe, it, expect, vi } from 'vitest';
import { getAppRuntime, setAppRuntime } from './appRuntime';

afterEach(() => {
  setAppRuntime(null);
  vi.unstubAllGlobals();
});

describe('application runtime selection', () => {
  it('does not report simulated command success in an unsupported browser', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('SharedArrayBuffer', undefined);
    await expect(getAppRuntime()).rejects.toThrow('This browser cannot run the workspace');
  });

  it('still supports server rendering without booting a browser container', async () => {
    vi.stubGlobal('window', undefined);
    expect((await getAppRuntime()).kind).toBe('memory');
  });
});

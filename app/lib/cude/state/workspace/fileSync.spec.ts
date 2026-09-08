/**
 * Cude.new - workspace synchronisation behaviour.
 *
 * Driven against MemoryRuntime, so the whole two-way sync — including the echo
 * suppression and the conflict policy — is verifiable without a browser
 * container. None of this was reachable by tests before.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { FileSync, isIgnoredPath } from './fileSync';

async function readyRuntime() {
  const runtime = new MemoryRuntime();
  await runtime.initializeWorkspace();

  return runtime;
}

const PROJECT = [
  { path: 'package.json', contents: '{}' },
  { path: 'src/App.tsx', contents: 'v1' },
];

describe('ignored paths', () => {
  it('excludes dependency and VCS directories', () => {
    expect(isIgnoredPath('/node_modules/react/index.js')).toBe(true);
    expect(isIgnoredPath('/src/node_modules/x.ts')).toBe(true);
    expect(isIgnoredPath('/.git/HEAD')).toBe(true);
    expect(isIgnoredPath('/src/App.tsx')).toBe(false);
  });

  it('does not exclude a path that merely starts with an ignored name', () => {
    expect(isIgnoredPath('/node_modules_backup/x.ts')).toBe(false);
  });
});

describe('mount', () => {
  let runtime: MemoryRuntime;
  let sync: FileSync;

  beforeEach(async () => {
    runtime = await readyRuntime();
    sync = new FileSync(runtime);
  });

  it('places the project in both the model and the runtime', async () => {
    await sync.mount(PROJECT);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('v1');
    expect(await runtime.readFile('src/App.tsx')).toBe('v1');
  });

  it('treats a freshly mounted project as unmodified', async () => {
    await sync.mount(PROJECT);
    expect(sync.files.modifiedFiles()).toEqual([]);
  });

  it('removes files that are absent when a project is mounted again', async () => {
    await sync.mount(PROJECT);
    await sync.mount([{ path: 'README.md', contents: '# restored' }]);

    expect(sync.files.getFile('/src/App.tsx')).toBeUndefined();
    expect(await runtime.readFile('src/App.tsx')).toBeNull();
    expect(sync.files.getFile('/README.md')?.content).toBe('# restored');
  });

  it('never mounts dependency directories', async () => {
    await sync.mount([...PROJECT, { path: 'node_modules/react/index.js', contents: 'x' }]);

    expect(sync.files.getFile('/node_modules/react/index.js')).toBeUndefined();
    expect(await runtime.listFiles()).not.toContain('node_modules/react/index.js');
  });

  it('reports a mount failure instead of throwing at the caller', async () => {
    const failing = await readyRuntime();
    vi.spyOn(failing, 'mountProject').mockRejectedValue(new Error('container gone'));

    const onError = vi.fn();
    const failingSync = new FileSync(failing, {}, { onError });
    await failingSync.mount(PROJECT);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'container gone' }), {
      operation: 'mount',
    });
  });
});

describe('local writes', () => {
  let runtime: MemoryRuntime;
  let sync: FileSync;

  beforeEach(async () => {
    runtime = await readyRuntime();
    sync = new FileSync(runtime);
    await sync.mount(PROJECT);
  });

  it('writes through to the runtime and marks the file saved', async () => {
    expect(await sync.save('/src/App.tsx', 'v2')).toBe(true);

    expect(await runtime.readFile('src/App.tsx')).toBe('v2');
    expect(sync.files.isModified('/src/App.tsx')).toBe(false);
  });

  it('refuses to save a locked file and does not touch the runtime', async () => {
    sync.files.lock('/src/App.tsx');

    expect(await sync.save('/src/App.tsx', 'v2')).toBe(false);

    // A lock that only stopped the UI would still let the file change on disk.
    expect(await runtime.readFile('src/App.tsx')).toBe('v1');
  });

  it('rolls back the pending write when the runtime rejects it', async () => {
    vi.spyOn(runtime, 'writeFiles').mockRejectedValueOnce(new Error('disk full'));

    const onError = vi.fn();
    const s = new FileSync(runtime, sync.files.map, { onError });

    expect(await s.save('/src/App.tsx', 'v2')).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }), {
      path: '/src/App.tsx',
      operation: 'save',
    });
  });

  it('refuses to remove a locked path', async () => {
    sync.files.lock('/src');

    expect(sync.remove('/src')).toEqual([]);
    expect(sync.files.getFile('/src/App.tsx')).toBeDefined();
  });
});

describe('runtime changes', () => {
  let runtime: MemoryRuntime;
  let sync: FileSync;

  beforeEach(async () => {
    runtime = await readyRuntime();
    sync = new FileSync(runtime);
    await sync.mount(PROJECT);
  });

  it('adopts a file created outside Cude', () => {
    sync.applyRuntimeChanges([{ path: 'src/New.tsx', kind: 'added', contents: 'fresh' }]);

    expect(sync.files.getFile('/src/New.tsx')?.content).toBe('fresh');
  });

  it('adopts an external edit to an untouched file', () => {
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'from-outside' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('from-outside');
    expect(sync.files.isModified('/src/App.tsx')).toBe(false);
  });

  it('drops a file removed outside Cude', () => {
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'removed' }]);

    expect(sync.files.getFile('/src/App.tsx')).toBeUndefined();
  });

  it('creates folders the runtime reports', () => {
    sync.applyRuntimeChanges([{ path: 'src/generated', kind: 'added', isDirectory: true }]);

    expect(sync.files.get('/src/generated')?.type).toBe('folder');
  });

  it('records an undecodable file as binary rather than empty text', () => {
    sync.applyRuntimeChanges([{ path: 'logo.png', kind: 'added' }]);

    expect(sync.files.getFile('/logo.png')?.isBinary).toBe(true);
  });

  it('ignores changes under dependency directories', () => {
    sync.applyRuntimeChanges([{ path: 'node_modules/react/index.js', kind: 'added', contents: 'x' }]);

    expect(sync.files.getFile('/node_modules/react/index.js')).toBeUndefined();
  });

  it('never applies a runtime change to a locked file', () => {
    sync.files.lock('/src/App.tsx');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'external' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('v1');
  });
});

describe('echo suppression', () => {
  it('does not re-apply the runtime echo of our own write', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    await sync.save('/src/App.tsx', 'v2');

    // The user keeps typing before the echo arrives.
    sync.files.writeFile('/src/App.tsx', 'v2-plus-typing');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'v2' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('v2-plus-typing');
  });

  it('still applies a genuine external change after the echo is consumed', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    await sync.save('/src/App.tsx', 'v2');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'v2' }]);
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'v3-external' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('v3-external');
  });
});

describe('conflicts', () => {
  it('keeps unsaved local work by default', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    sync.files.writeFile('/src/App.tsx', 'my-unsaved-edit');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'theirs' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('my-unsaved-edit');
    expect(sync.conflicts).toEqual([{ path: '/src/App.tsx', resolution: 'keep-local' }]);
  });

  it('can be configured to take the runtime version', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime, {}, { conflictPolicy: 'take-runtime' });
    await sync.mount(PROJECT);

    sync.files.writeFile('/src/App.tsx', 'my-unsaved-edit');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'theirs' }]);

    expect(sync.files.getFile('/src/App.tsx')?.content).toBe('theirs');
    expect(sync.conflicts[0].resolution).toBe('take-runtime');
  });

  it('reports no conflict when the runtime content already matches', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'v1' }]);

    expect(sync.conflicts).toEqual([]);
  });

  it('clears conflicts on request', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);
    sync.files.writeFile('/src/App.tsx', 'edit');
    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'theirs' }]);
    sync.clearConflicts();

    expect(sync.conflicts).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('notifies a subscriber when the model changes', async () => {
    const runtime = await readyRuntime();
    const onChanged = vi.fn();
    const sync = new FileSync(runtime, {}, { onChanged });

    await sync.mount(PROJECT);
    onChanged.mockClear();

    sync.applyRuntimeChanges([{ path: 'src/New.tsx', kind: 'added', contents: 'x' }]);

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('does not notify when nothing actually changed', async () => {
    const runtime = await readyRuntime();
    const onChanged = vi.fn();
    const sync = new FileSync(runtime, {}, { onChanged });
    await sync.mount(PROJECT);
    onChanged.mockClear();

    sync.applyRuntimeChanges([{ path: 'src/App.tsx', kind: 'changed', contents: 'v1' }]);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('applies real watcher events end to end', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    runtime.emitExternalChange([{ path: 'src/Watched.tsx', kind: 'added', contents: 'watched' }]);

    expect(sync.files.getFile('/src/Watched.tsx')?.content).toBe('watched');
  });

  it('stops applying changes once disposed', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    sync.dispose();
    runtime.emitExternalChange([{ path: 'src/After.tsx', kind: 'added', contents: 'late' }]);

    expect(sync.files.getFile('/src/After.tsx')).toBeUndefined();
  });

  it('is safe to dispose twice', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);

    sync.dispose();
    expect(() => sync.dispose()).not.toThrow();
  });

  it('refuses further work after disposal rather than failing silently', async () => {
    const runtime = await readyRuntime();
    const sync = new FileSync(runtime);
    await sync.mount(PROJECT);
    sync.dispose();

    await expect(sync.save('/src/App.tsx', 'v2')).rejects.toThrow(/disposed/);
  });
});

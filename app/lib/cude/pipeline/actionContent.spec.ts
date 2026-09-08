/**
 * Cude.new — the content that gets written is the content that arrived.
 *
 * A file action opens before any of its content exists: the tag is emitted,
 * then the file streams in. The executor kept its own copy of the action taken
 * at that moment, and the runner ran it by id alone — so at close it wrote
 * that copy. Zero bytes, over the file the editor had just saved correctly.
 *
 * Whether the empty write landed before or after the good one was a race,
 * which is why a generated project was sometimes intact and sometimes a set of
 * correctly named, completely empty files. It is also why a follow-up change
 * appeared to do nothing.
 */

import { describe, it, expect } from 'vitest';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { WorkspaceService } from '~/lib/cude/state/workspace/workspaceService';
import { TerminalService } from '~/lib/cude/state/workspace/terminalService';
import { CudeActionRunner } from './actionRunnerAdapter';
import { resolveWorkspacePath } from './actionExecutor';

async function harness() {
  const runtime = new MemoryRuntime();
  await runtime.initializeWorkspace();

  const workspace = new WorkspaceService(runtime);
  await workspace.mount([{ path: 'package.json', contents: '{}' }]);

  const terminals = new TerminalService();
  terminals.attachRuntime(runtime);

  return { workspace, runner: new CudeActionRunner({ workspace, terminals }) };
}

/** What the parser emits: an open with nothing, then the content, then a close. */
const event = (content: string) => ({
  messageId: 'msg-1',
  artifactId: 'timer',
  actionId: '0',
  action: { type: 'file' as const, filePath: 'index.html', content },
});

describe('running a file action', () => {
  it('writes what the file ended up being, not what it was when it opened', async () => {
    const { workspace, runner } = await harness();

    // Opened empty, as every file action is.
    runner.addAction(event(''));

    // Streamed in.
    await runner.runAction(event('<!doctype html><body>hello'), true);

    // Closed with the whole thing.
    await runner.runAction(event('<!doctype html><body>hello</body>'));

    const written = workspace.getFile(resolveWorkspacePath('index.html'))?.content;

    expect(written, 'the file was written with the content it opened with').toBe('<!doctype html><body>hello</body>');
  });

  it('does not create the file before any content has arrived', async () => {
    /*
     * An empty streaming write leaves a correctly named empty file behind if
     * the turn then fails — which reads as a finished build that produced
     * nothing.
     */
    const { workspace, runner } = await harness();

    runner.addAction(event(''));
    await runner.runAction(event(''), true);

    expect(workspace.getFile(resolveWorkspacePath('index.html'))).toBeUndefined();
  });

  it('fills the file in as it streams, so the editor is not blank', async () => {
    const { workspace, runner } = await harness();

    runner.addAction(event(''));
    await runner.runAction(event('<!doctype'), true);

    expect(workspace.getFile(resolveWorkspacePath('index.html'))?.content).toBe('<!doctype');
  });
});

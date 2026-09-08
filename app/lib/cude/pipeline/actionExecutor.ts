/**
 * Cude.new - action executor.
 *
 * Runs the actions a parsed artifact produced, in the order the model emitted
 * them, against the workspace and the terminal. Order matters and is not
 * negotiable: `package.json` has to exist before the install that reads it, so
 * actions are queued rather than run concurrently.
 *
 * Built on `WorkspaceService` and `TerminalService`, both of which are
 * injected. That is what lets the whole execution path — including a failing
 * build and the alert it raises — be verified without a browser container.
 */

import { atom, map } from 'nanostores';
import type { WorkspaceService } from '~/lib/cude/state/workspace/workspaceService';
import type { TerminalService } from '~/lib/cude/state/workspace/terminalService';
import type { CudeAction } from './artifactProtocol';
import { WORK_DIR } from '~/lib/cude/constants';

/**
 * Makes a command runnable where nobody can answer it.
 *
 * The workspace shell has no person at the keyboard. `npx serve .` for a
 * package that is not installed yet prints "Need to install the following
 * packages... Ok to proceed? (y)" and waits — forever, because that prompt is
 * answered by a human or not at all. The generated app was complete and
 * correct, every file written, and the preview never came up.
 *
 * So the flag meaning "do not ask" is supplied. Only where its absence is a
 * guaranteed hang: `npx`, and `npm create` / `npm init`, which are the ones
 * that stop for an install prompt. Everything else passes through untouched —
 * rewriting a command the model asked for is not something to do
 * speculatively.
 */
export function withoutPrompts(command: string): string {
  return command
    .replace(/(^|[\n;&|]\s*)npx(?!\s+(?:--yes|-y)\b)\s+/g, '$1npx --yes ')
    .replace(/(^|[\n;&|]\s*)npm\s+(create|init)(?!\s+(?:--yes|-y)\b)\s+/g, '$1npm $2 --yes ');
}

/**
 * The one name a generated file is known by.
 *
 * A model writes `filePath="index.html"` and means the workspace root. Passed
 * through as it stood, the workspace recorded it as `/index.html` while the
 * container's own file watcher reported the very same file as
 * `/home/project/index.html`. Two entries, one file: the tree showed six files
 * for a three-file app, and the one the editor opened by default was whichever
 * partial content the streaming write had left behind.
 *
 * The watcher's shape wins, because it is the one that arrives unprompted and
 * cannot be changed. The runtime strips this prefix again before touching the
 * filesystem, so the file still lands exactly where it did.
 */
export function resolveWorkspacePath(filePath: string): string {
  const trimmed = filePath.trim();

  if (trimmed.startsWith(`${WORK_DIR}/`) || trimmed === WORK_DIR) {
    return trimmed;
  }

  return `${WORK_DIR}/${trimmed.replace(/^\/+/, '')}`;
}

export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed' | 'aborted';

export interface ActionState extends CudeAction {
  status: ActionStatus;

  /** Combined output, for actions that ran a command. */
  output?: string;
  exitCode?: number;
  error?: string;
  abort?: () => void;
}

/** Raised when an action fails, so the pipeline can offer a repair. */
export interface ActionFailure {
  actionId: string;
  type: CudeAction['type'];
  title: string;
  description: string;

  /** Real command output. Never fabricated. */
  output: string;
  exitCode?: number;
}

export interface ActionExecutorOptions {
  workspace: WorkspaceService;
  terminals: TerminalService;

  /** Called when an action fails. */
  onFailure?: (failure: ActionFailure) => void;

  /** Called whenever an action's state changes. */
  onChange?: (actionId: string, state: ActionState) => void;
}

/** Human-readable title for a failure, by action type. */
function failureTitle(type: CudeAction['type']): string {
  switch (type) {
    case 'file':
      return 'Could not write a file';
    case 'build':
      return 'Build failed';
    case 'start':
      return 'Could not start the dev server';
    default:
      return 'Command failed';
  }
}

export class ActionExecutor {
  readonly actions = map<Record<string, ActionState>>({});
  readonly running = atom<boolean>(false);

  private _workspace: WorkspaceService;
  private _terminals: TerminalService;
  private _options: ActionExecutorOptions;

  /** Serializes execution; actions run in the order they were added. */
  private _queue: Promise<void> = Promise.resolve();
  private _aborted = false;
  private _failed = false;

  constructor(options: ActionExecutorOptions) {
    this._workspace = options.workspace;
    this._terminals = options.terminals;
    this._options = options;
  }

  /** Register an action. Re-registering an id updates it in place. */
  add(actionId: string, action: CudeAction): void {
    if (this._aborted) {
      this._update(actionId, { ...action, status: 'aborted' });
      return;
    }

    const existing = this.actions.get()[actionId];

    if (existing && existing.status !== 'pending') {
      // Already running or finished; only content updates are meaningful.
      this._update(actionId, { ...existing, content: action.content });
      return;
    }

    this._update(actionId, { ...action, status: 'pending' });
  }

  /**
   * Queue an action to run.
   *
   * A `file` action arriving mid-stream is written immediately so the editor
   * fills in, but it is only marked complete once its content is final.
   */
  run(actionId: string, options: { streaming?: boolean } = {}): Promise<void> {
    const action = this.actions.get()[actionId];

    if (!action || this._aborted) {
      return Promise.resolve();
    }

    if (options.streaming) {
      if (action.type !== 'file') {
        return Promise.resolve();
      }

      return this._writeFile(actionId, action, true);
    }

    if (action.status !== 'pending') {
      return Promise.resolve();
    }

    this._queue = this._queue.then(() => this._execute(actionId)).catch(() => undefined);

    return this._queue;
  }

  /** Stop the queue. Actions still pending are marked aborted. */
  abort(): void {
    this._aborted = true;

    for (const [id, action] of Object.entries(this.actions.get())) {
      if (action.status === 'pending' || action.status === 'running') {
        action.abort?.();
        this._update(id, { ...action, status: 'aborted' });
      }
    }

    this.running.set(false);
  }

  private async _execute(actionId: string): Promise<void> {
    const action = this.actions.get()[actionId];

    if (!action || this._aborted || action.status !== 'pending') {
      return;
    }

    if (this._failed && action.type !== 'file') {
      this._update(actionId, { ...action, status: 'aborted', error: 'Skipped because an earlier action failed.' });
      return;
    }

    this._update(actionId, { ...action, status: 'running' });
    this.running.set(true);

    try {
      switch (action.type) {
        case 'file':
          await this._writeFile(actionId, action, false);
          break;
        case 'shell':
        case 'build':
          await this._runCommand(actionId, action);
          break;
        case 'start':
          await this._startProcess(actionId, action);
          break;
        default:
          this._fail(actionId, action, `Unsupported action type: ${String(action.type)}`, '');
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._fail(actionId, action, message, '');
    } finally {
      this.running.set(false);
    }
  }

  private async _writeFile(actionId: string, action: ActionState, streaming: boolean): Promise<void> {
    if (!action.filePath) {
      this._fail(actionId, action, 'A file action arrived with no path.', '');
      return;
    }

    /*
     * A file action opens before any of its content has arrived, and writing
     * that opening is how the editor fills in as the model types. But writing
     * *nothing* is not the same as writing early: if the turn then fails — a
     * stream that timed out is the case seen here — the project is left as a
     * set of correctly named, completely empty files, which reads as a finished
     * build that produced nothing.
     *
     * So an empty streaming write is skipped. The file appears with its first
     * real character, and a turn that dies before that leaves no trace to
     * mistake for a result.
     */
    if (streaming && !action.content) {
      return;
    }

    const written = await this._workspace.saveFile(resolveWorkspacePath(action.filePath), action.content);

    if (!written) {
      /*
       * The workspace refuses a locked path. Reporting it is important: a file
       * that silently did not change would make the next stage act on code that
       * is not there.
       */
      this._fail(actionId, action, `${action.filePath} is locked and was not written.`, '');

      return;
    }

    if (!streaming) {
      this._update(actionId, { ...action, status: 'complete' });
    }
  }

  private async _runCommand(actionId: string, action: ActionState): Promise<void> {
    const controller = new AbortController();
    this._update(actionId, { ...action, status: 'running', abort: () => controller.abort() });

    const result = await this._terminals.execute(withoutPrompts(action.content), { signal: controller.signal });

    if (result.timedOut) {
      this._fail(
        actionId,
        action,
        'Command timed out. Check the terminal output and retry.',
        result.output,
        result.exitCode,
      );
      return;
    }

    if (result.aborted) {
      this._update(actionId, { ...action, status: 'aborted', output: result.output });
      return;
    }

    if (result.exitCode !== 0) {
      this._fail(actionId, action, `Exited with code ${result.exitCode}.`, result.output, result.exitCode);
      return;
    }

    this._update(actionId, {
      ...action,
      status: 'complete',
      output: result.output,
      exitCode: result.exitCode,
    });
  }

  /**
   * Start a long-running process.
   *
   * Wait for server readiness, with a deadline, rather than process exit.
   */
  private async _startProcess(actionId: string, action: ActionState): Promise<void> {
    const controller = new AbortController();
    this._update(actionId, { ...action, status: 'running', abort: () => controller.abort() });

    try {
      await this._terminals.startPreview(withoutPrompts(action.content), controller.signal);
      this._update(actionId, { ...action, status: controller.signal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      if (controller.signal.aborted) {
        this._update(actionId, { ...action, status: 'aborted' });
        return;
      }

      throw error;
    }
  }

  private _fail(actionId: string, action: ActionState, error: string, output: string, exitCode?: number): void {
    this._failed = true;
    this._update(actionId, { ...action, status: 'failed', error, output, exitCode });

    this._options.onFailure?.({
      actionId,
      type: action.type,
      title: failureTitle(action.type),
      description: error,
      output,
      exitCode,
    });
  }

  private _update(actionId: string, state: ActionState): void {
    this.actions.setKey(actionId, state);
    this._options.onChange?.(actionId, state);
  }
}

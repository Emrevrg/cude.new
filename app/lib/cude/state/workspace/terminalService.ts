/**
 * Cude.new - terminal sessions.
 *
 * Two kinds of terminal, with the same underlying shell:
 *
 *   attached  a shell the user types into, bound to a terminal view
 *   command   the shell the pipeline runs build and test commands in
 *
 * The command shell is kept separate on purpose. Running the Builder's commands
 * in whatever terminal the user happens to have focused would interleave two
 * streams of output and make an exit code ambiguous.
 *
 * Every session is disposable, and disposing the service disposes all of them.
 * The inherited store kept its terminal list in a private array with no way to
 * release it.
 */

import { atom } from 'nanostores';
import type { CudeRuntime, ShellSession, CommandResult, TerminalSize } from '~/lib/cude/runtime/types';
import { stripAnsi } from '~/lib/cude/runtime/shellProtocol';

export const COMMAND_TIMEOUT_MS = 180_000;

/** The minimum a terminal view has to provide. */
export interface TerminalView {
  readonly cols?: number;
  readonly rows?: number;
  write(data: string): void;
  onData(handler: (data: string) => void): void;
  reset?(): void;
}

interface AttachedTerminal {
  view: TerminalView;
  session: ShellSession;
  unsubscribe: () => void;
}

/**
 * Raised when the workspace has not finished starting.
 *
 * Distinct from a failure. Booting the container takes seconds, and anything
 * that reaches the terminal in that window is early, not broken.
 */
export class WorkspaceNotReadyError extends Error {
  readonly notReady = true;

  constructor() {
    super('The workspace is still starting.');
    this.name = 'WorkspaceNotReadyError';
  }
}

/** Text an interactive terminal shows when its shell could not start. */
export function shellFailureMessage(error: unknown): string {
  /*
   * Two different things, and they must not read alike.
   *
   * Before the container has booted there is nothing wrong — the panel is
   * simply early. "Terminal service has no runtime" was internal wording for
   * that ordinary state, and it reads as a fault: a screenshot of a healthy,
   * still-starting workspace looked like a bug report.
   */
  if ((error as { notReady?: boolean })?.notReady) {
    return `
The workspace is still starting. The terminal opens as soon as it is ready.
`;
  }

  const reason = error instanceof Error ? error.message : String(error);

  /*
   * Stated as a state, not a crash: "Could not start a shell" as the first
   * thing on screen reads as broken. The reason line underneath keeps the
   * diagnosability for when it genuinely fails.
   */
  return `
No shell is running in this workspace yet.
${reason}
`;
}

export class TerminalService {
  /** Whether the terminal panel is showing. */
  readonly visible = atom<boolean>(true);

  /** True once the command shell is ready to run commands. */
  readonly commandShellReady = atom<boolean>(false);

  private _runtime: CudeRuntime | null = null;

  /** Views that asked for a shell before the workspace had booted. */
  private _waitingViews: TerminalView[] = [];
  private _attached: AttachedTerminal[] = [];
  private _commandShell: ShellSession | null = null;
  private _openingCommandShell: Promise<ShellSession | null> | null = null;
  private _commandView?: TerminalView;
  private _previewShell: ShellSession | null = null;
  private _disposed = false;

  /** Point the service at a runtime. Existing sessions are left alone. */
  attachRuntime(runtime: CudeRuntime): void {
    this._runtime = runtime;

    /*
     * Anything that asked for a terminal while the workspace was still booting
     * gets one now.
     *
     * Without this, a view that arrived early was told the workspace was
     * starting and never told anything again — so reopening a saved
     * conversation left a terminal that said "still starting" forever, while
     * the files beside it loaded perfectly. Nothing retried, because nothing
     * was watching.
     */
    const waiting = this._waitingViews.splice(0);

    for (const view of waiting) {
      void this.attach(view);
    }
  }

  toggle(value?: boolean): void {
    this.visible.set(value ?? !this.visible.get());
  }

  private _requireRuntime(): CudeRuntime {
    if (!this._runtime) {
      throw new WorkspaceNotReadyError();
    }

    return this._runtime;
  }

  /**
   * Bind a terminal view to a new shell.
   *
   * A failure is written into the terminal rather than thrown: the user asked
   * for a terminal, and an empty panel with no explanation is worse than an
   * error message they can read.
   */
  async attach(view: TerminalView): Promise<boolean> {
    if (this._disposed) {
      return false;
    }

    try {
      const size = this._sizeOf(view);
      const session = await this._requireRuntime().openShell({ size });

      const unsubscribe = session.onOutput((chunk) => view.write(chunk));
      view.onData((data) => session.write(data));

      this._attached.push({ view, session, unsubscribe });

      return true;
    } catch (error) {
      /*
       * Not ready is not the same as broken: remember the view so it gets a
       * shell the moment the workspace arrives. A genuine failure is reported
       * and not retried, or it would loop.
       */
      if ((error as { notReady?: boolean })?.notReady && !this._waitingViews.includes(view)) {
        this._waitingViews.push(view);
      }

      view.write(shellFailureMessage(error));

      return false;
    }
  }

  /** Open (or reuse) the shell the pipeline runs commands in. */
  async openCommandShell(view?: TerminalView): Promise<ShellSession | null> {
    if (view) {
      this._commandView = view;
    }

    if (this._disposed) {
      return null;
    }

    if (this._commandShell) {
      return this._commandShell;
    }

    if (this._openingCommandShell) {
      return this._openingCommandShell;
    }

    this._openingCommandShell = this._createCommandShell(view);

    try {
      return await this._openingCommandShell;
    } finally {
      this._openingCommandShell = null;
    }
  }

  private async _createCommandShell(view?: TerminalView): Promise<ShellSession | null> {
    try {
      const session = await this._requireRuntime().openShell({
        size: view ? this._sizeOf(view) : undefined,
      });

      if (this._disposed) {
        await session.kill();
        return null;
      }

      session.onOutput((chunk) => this._commandView?.write(chunk));

      this._commandShell = session;
      this.commandShellReady.set(true);
      void session.exited.then(() => {
        if (this._commandShell === session) {
          this._commandShell = null;
          this.commandShellReady.set(false);
        }
      });

      return session;
    } catch (error) {
      view?.write(shellFailureMessage(error));
      this.commandShellReady.set(false);

      return null;
    }
  }

  /**
   * Run a command in the command shell.
   *
   * Reports a failure rather than throwing, so a pipeline stage always gets a
   * result it can classify.
   */
  async execute(command: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CommandResult> {
    const startedAt = Date.now();

    if (options.signal?.aborted) {
      return { command, exitCode: 130, output: 'Command cancelled.', durationMs: 0, aborted: true };
    }

    const shell = await this.openCommandShell();

    if (!shell) {
      return {
        command,
        exitCode: -1,
        output: 'No shell is available in this workspace.',
        durationMs: 0,
        aborted: false,
      };
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
    let output = '';
    const unsubscribe = shell.onOutput((chunk) => {
      output = (output + chunk).slice(-64_000);
    });
    let stop!: (timedOut: boolean) => void;
    const interrupted = new Promise<CommandResult>((resolve) => {
      stop = (timedOut) => {
        /*
         * Invalidate before killing: the next command must never inherit output
         * or completion markers from the interrupted process.
         */
        if (this._commandShell === shell) {
          this._commandShell = null;
          this.commandShellReady.set(false);
        }

        controller.abort();
        void shell.kill().catch(() => undefined);
        resolve({
          command,
          exitCode: timedOut ? 124 : 130,
          output: `${stripAnsi(output)}\n${
            timedOut
              ? `Command timed out after ${Math.round(timeoutMs / 1000)} seconds. Check the terminal output and network connection, then retry.`
              : 'Command cancelled.'
          }`.trim(),
          durationMs: Date.now() - startedAt,
          aborted: true,
          timedOut,
        });
      };
    });
    const onAbort = () => stop(false);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => stop(true), timeoutMs);

    try {
      if (options.signal?.aborted) {
        stop(false);
        return await interrupted;
      }

      return await Promise.race([interrupted, shell.execute(command, { signal: controller.signal })]);
    } catch (error) {
      return {
        command,
        exitCode: -1,
        output: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        aborted: false,
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    }
  }

  /** Keep the start action running until a server actually announces readiness. */
  async startPreview(command: string, signal?: AbortSignal): Promise<void> {
    const runtime = this._requireRuntime();
    await this._previewShell?.kill();

    const shell = await runtime.openShell();
    this._previewShell = shell;
    shell.onOutput((chunk) => this._commandView?.write(chunk));

    let unsubscribe: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    let ready = false;

    try {
      await new Promise<void>((resolve, reject) => {
        unsubscribe = runtime.watchPreviews((change) => {
          if (change.kind === 'ready') {
            ready = true;
            resolve();
          }
        });
        onAbort = () => reject(new Error('Preview start cancelled.'));
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          () => reject(new Error('The preview did not start within 60 seconds. Check the terminal output and retry.')),
          60_000,
        );

        if (signal?.aborted) {
          onAbort();
          return;
        }

        void shell.execute(command, { signal }).then((result) => {
          if (!ready) {
            reject(
              new Error(
                result.output || `The preview command exited with code ${result.exitCode} before a server was ready.`,
              ),
            );
          }
        }, reject);
      });
    } finally {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);

      if (!ready) {
        if (this._previewShell === shell) {
          this._previewShell = null;
        }

        void shell.kill().catch(() => undefined);
      }
    }
  }

  /**
   * A handle the pipeline's action runner can drive.
   *
   * Shaped for that caller: it waits for readiness, runs one command at a time,
   * and reports an exit code. Aborting interrupts the running command.
   */
  commandShellHandle() {
    const service = this;

    return {
      async ready(): Promise<void> {
        await service.openCommandShell();
      },

      get ready$(): boolean {
        return service.commandShellReady.get();
      },

      /** Present so callers can check the shell exists before using it. */
      get terminal(): boolean {
        return service._hasCommandShell();
      },

      get process(): boolean {
        return service._hasCommandShell();
      },

      async executeCommand(
        _sessionId: string,
        command: string,
        onAbort?: () => void,
      ): Promise<{ exitCode: number; output: string }> {
        const controller = new AbortController();
        const result = await service.execute(command, { signal: controller.signal });

        if (result.aborted) {
          onAbort?.();
        }

        return { exitCode: result.exitCode, output: result.output };
      },
    };
  }

  /** True once a command shell exists. */
  _hasCommandShell(): boolean {
    return this._commandShell !== null;
  }

  /** Tell every attached shell the terminal size changed. */
  resize(size: TerminalSize): void {
    for (const { session } of this._attached) {
      session.resize(size);
    }
  }

  /** Release one attached terminal. */
  async detach(view: TerminalView): Promise<void> {
    this._waitingViews = this._waitingViews.filter((waiting) => waiting !== view);

    const index = this._attached.findIndex((entry) => entry.view === view);

    if (index === -1) {
      return;
    }

    const [entry] = this._attached.splice(index, 1);
    entry.unsubscribe();

    try {
      await entry.session.kill();
    } catch {
      // Already gone; nothing to release.
    }
  }

  get attachedCount(): number {
    return this._attached.length;
  }

  private _sizeOf(view: TerminalView): TerminalSize | undefined {
    if (view.cols === undefined || view.rows === undefined) {
      return undefined;
    }

    return { cols: view.cols, rows: view.rows };
  }

  /** End every session. Safe to call twice. */
  async dispose(): Promise<void> {
    this._disposed = true;
    this._waitingViews = [];
    await this._previewShell?.kill();
    this._previewShell = null;

    for (const entry of this._attached) {
      entry.unsubscribe();

      try {
        await entry.session.kill();
      } catch {
        // Already gone.
      }
    }

    this._attached = [];

    if (this._commandShell) {
      try {
        await this._commandShell.kill();
      } catch {
        // Already gone.
      }

      this._commandShell = null;
    }

    this.commandShellReady.set(false);
  }
}

/**
 * Cude.new - browser runtime backed by the WebContainer API.
 *
 * WebContainer is a third-party dependency, used through its public API. This
 * file is Cude.new's adapter onto the CudeRuntime contract: it owns the
 * lifecycle, translates results into the shapes the pipeline expects, and
 * classifies failures through the same helper the in-memory runtime uses, so a
 * build failure reads identically in either backend.
 *
 * The runtime is constructed, not imported as a booted singleton. That is a
 * deliberate design choice: a module-level `Promise` that boots on import
 * cannot be torn down, cannot be swapped in a test, and — on the server, where
 * no container exists — resolves never, silently hanging any caller. Explicit
 * construction lets the app own when the container starts and lets the
 * verifiers substitute MemoryRuntime.
 */

import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import type {
  BuildResult,
  CommandResult,
  CudeRuntime,
  FileChange,
  PreviewHandle,
  ProcessHandle,
  RunCommandOptions,
  PreviewChange,
  ShellSession,
  TerminalSize,
  WorkspaceFile,
} from './types';
import { classifyBuildResult, normalizeWorkspacePath } from './shared';
import { ShellOutputParser } from './shellProtocol';

/** Injected so tests and the verifiers never need a real container. */
export interface WebContainerRuntimeOptions {
  /** Boots (or returns) the container instance. */
  boot: () => Promise<WebContainer>;

  /** Name of the directory the workspace is mounted under. */
  workdirName?: string;
}

interface TrackedProcess {
  process: WebContainerProcess;
  command: string;
  startedAt: number;
  aborted: boolean;
}

/** Split a command line into the binary and its arguments. */
function splitCommand(command: string): { bin: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    throw new Error('Empty command');
  }

  return { bin: parts[0], args: parts.slice(1) };
}

/** Build the nested tree the WebContainer mount API expects from flat paths. */
export function buildMountTree(files: WorkspaceFile[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const file of files) {
    const segments = normalizeWorkspacePath(file.path).split('/');
    const name = segments.pop() as string;

    let cursor = root;

    for (const segment of segments) {
      const existing = cursor[segment] as { directory?: Record<string, unknown> } | undefined;

      if (!existing?.directory) {
        cursor[segment] = { directory: {} };
      }

      cursor = (cursor[segment] as { directory: Record<string, unknown> }).directory;
    }

    cursor[name] = { file: { contents: file.contents } };
  }

  return root;
}

interface RawWatchEvent {
  type?: string;
  path?: string;
  buffer?: Uint8Array;
}

/** Flatten and translate the runtime's watch events into FileChange records. */
export function normalizeWatchEvents(events: unknown): FileChange[] {
  const flat: RawWatchEvent[] = Array.isArray(events) ? (events.flat(2) as RawWatchEvent[]) : [];
  const out: FileChange[] = [];

  for (const event of flat) {
    if (!event || typeof event.path !== 'string') {
      continue;
    }

    const path = normalizeWorkspacePath(event.path);

    switch (event.type) {
      case 'add_file':
      case 'add_dir':
        out.push({
          path,
          kind: 'added',
          isDirectory: event.type === 'add_dir',
          contents: decodeContents(event.buffer),
        });
        break;
      case 'change':
        out.push({ path, kind: 'changed', contents: decodeContents(event.buffer) });
        break;
      case 'remove_file':
      case 'remove_dir':
        out.push({ path, kind: 'removed', isDirectory: event.type === 'remove_dir' });
        break;
      default:
        break;
    }
  }

  return out;
}

/** Decode watched file contents, treating undecodable bytes as binary. */
function decodeContents(buffer?: Uint8Array): string | undefined {
  if (!buffer) {
    return undefined;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Binary file; the model records it without text content.
    return undefined;
  }
}

export class WebContainerRuntime implements CudeRuntime {
  readonly kind = 'webcontainer';

  private _boot: () => Promise<WebContainer>;
  private _container: WebContainer | null = null;
  private _processes = new Map<string, TrackedProcess>();
  private _nextId = 1;
  private _previewPorts = new Map<number, string>();
  private _shells = new Map<string, ShellSession>();

  constructor(options: WebContainerRuntimeOptions) {
    this._boot = options.boot;
  }

  async initializeWorkspace(): Promise<void> {
    if (this._container) {
      return;
    }

    this._container = await this._boot();

    /*
     * Record forwarded preview URLs as they appear so startPreview can resolve
     * with a real URL instead of guessing one from the port.
     */
    this._container.on('server-ready', (port, url) => {
      this._previewPorts.set(port, url);
    });
  }

  isReady(): boolean {
    return this._container !== null;
  }

  private _requireContainer(): WebContainer {
    if (!this._container) {
      /*
       * Said the way a person can act on. This reached the conversation as
       * "A command failed - Cude runtime used before initializeWorkspace()",
       * which names an internal function and asks the reader to know what a
       * workspace is. The cause is fixed — actions wait for the runtime now —
       * but if it ever happens again this should still read as a sentence.
       */
      throw new Error('The workspace is not ready yet. Wait a moment and send the message again.');
    }

    return this._container;
  }

  async mountProject(files: WorkspaceFile[]): Promise<void> {
    const container = this._requireContainer();
    await container.mount(buildMountTree(files) as never);
  }

  async writeFiles(files: WorkspaceFile[]): Promise<void> {
    const container = this._requireContainer();

    for (const file of files) {
      const path = normalizeWorkspacePath(file.path);
      const dir = path.split('/').slice(0, -1).join('/');

      if (dir) {
        await container.fs.mkdir(dir, { recursive: true });
      }

      await container.fs.writeFile(path, file.contents);
    }
  }

  async readFile(path: string): Promise<string | null> {
    const container = this._requireContainer();

    try {
      return await container.fs.readFile(normalizeWorkspacePath(path), 'utf-8');
    } catch {
      // The API throws for a missing file; the contract says report null.
      return null;
    }
  }

  async listFiles(): Promise<string[]> {
    const container = this._requireContainer();
    const found: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await container.fs.readdir(dir || '.', { withFileTypes: true });

      for (const entry of entries) {
        // Generated projects install dependencies; those are not project files.
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        const child = dir ? `${dir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await walk(child);
        } else {
          found.push(child);
        }
      }
    };

    await walk('');

    return found.sort();
  }

  private async _start(command: string, options: RunCommandOptions): Promise<{ id: string; tracked: TrackedProcess }> {
    const container = this._requireContainer();
    const { bin, args } = splitCommand(command);

    const process = await container.spawn(bin, args, {
      /*
       * Left to the container when the caller says nothing, which is the
       * workspace it was booted with. Naming it explicitly here was tried and
       * reverted: the container has not necessarily materialised that
       * directory when a shell opens, and spawning into it threw ENOENT and
       * left the workspace with no terminal at all.
       */
      cwd: options.cwd,
      env: options.env,
    });

    const id = `wc-${this._nextId++}`;
    const tracked: TrackedProcess = { process, command, startedAt: Date.now(), aborted: false };
    this._processes.set(id, tracked);

    return { id, tracked };
  }

  private _collectOutput(tracked: TrackedProcess, options: RunCommandOptions): { read: Promise<string> } {
    const chunks: string[] = [];

    const read = tracked.process.output
      .pipeTo(
        new WritableStream<string>({
          write(chunk) {
            chunks.push(chunk);
            options.onOutput?.(chunk);
          },
        }),
      )
      .then(() => chunks.join(''))
      .catch(() => chunks.join(''));

    return { read };
  }

  async spawn(command: string, options: RunCommandOptions = {}): Promise<ProcessHandle> {
    const { id, tracked } = await this._start(command, options);
    const { read } = this._collectOutput(tracked, options);

    const result = (async (): Promise<CommandResult> => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (options.timeoutMs) {
        timer = setTimeout(() => {
          void this.stopProcess(id);
        }, options.timeoutMs);
      }

      const exitCode = await tracked.process.exit;

      if (timer) {
        clearTimeout(timer);
      }

      this._processes.delete(id);

      return {
        command,
        exitCode,
        output: await read,
        durationMs: Date.now() - tracked.startedAt,
        aborted: tracked.aborted,
      };
    })();

    return { id, command, result };
  }

  async runCommand(command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
    const handle = await this.spawn(command, options);
    return handle.result;
  }

  async stopProcess(id: string): Promise<void> {
    const tracked = this._processes.get(id);

    if (!tracked) {
      return;
    }

    tracked.aborted = true;

    try {
      tracked.process.kill();
    } catch {
      // Already gone; the exit promise still settles.
    }
  }

  async startPreview(command: string, options: RunCommandOptions = {}): Promise<PreviewHandle> {
    const container = this._requireContainer();

    const ready = new Promise<PreviewHandle>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? 60_000;
      const timer = setTimeout(() => {
        reject(new Error(`Preview did not start within ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      container.on('server-ready', (port, url) => {
        clearTimeout(timer);
        resolve({ port, url });
      });
    });

    await this.spawn(command, options);

    return ready;
  }

  async collectBuildResult(command: string, options: RunCommandOptions = {}): Promise<BuildResult> {
    if (!this.isReady()) {
      return {
        succeeded: false,
        command,
        exitCode: -1,
        output: 'Workspace runtime is not available.',
        durationMs: 0,
        failureKind: 'runtime_unavailable',
      };
    }

    return classifyBuildResult(await this.runCommand(command, options));
  }

  /**
   * Observe preview servers.
   *
   * `server-ready` announces a server that is actually serving; `port` with a
   * close type announces one going away. Both are needed: a preview that has
   * stopped must disappear from the UI rather than showing a dead iframe.
   */
  watchPreviews(onChange: (change: PreviewChange) => void): () => void {
    const container = this._requireContainer();
    let disposed = false;

    container.on('server-ready', (port, url) => {
      if (!disposed) {
        this._previewPorts.set(port, url);
        onChange({ port, url, kind: 'ready' });
      }
    });

    container.on('port', (port, type, url) => {
      if (disposed) {
        return;
      }

      if (type === 'close') {
        this._previewPorts.delete(port);
        onChange({ port, url, kind: 'closed' });
      }
    });

    return () => {
      disposed = true;
    };
  }

  /**
   * Open an interactive shell.
   *
   * `--osc` asks the workspace shell to emit the control sequences that mark
   * command boundaries; without them there is no way to know when a command
   * finished or what it exited with.
   */
  async openShell(options: { size?: TerminalSize } = {}): Promise<ShellSession> {
    const container = this._requireContainer();
    const size = options.size ?? { cols: 80, rows: 24 };

    const process = await container.spawn('/bin/jsh', ['--osc'], {
      terminal: { cols: size.cols, rows: size.rows },
    });

    const id = `shell-${this._nextId++}`;
    const input = process.input.getWriter();
    const listeners = new Set<(chunk: string) => void>();
    const parser = new ShellOutputParser();

    /** Resolver for the command currently being awaited, if any. */
    let pending: ((result: { output: string; exitCode: number }) => void) | null = null;
    let killed = false;
    let promptTail = '';
    let executing = false;

    /*
     * A command written before the shell reaches its first prompt is typed into
     * a shell that is not listening yet, and no completion marker ever arrives.
     * Every execute waits for this.
     */
    let markPrompted!: () => void;
    const prompted = new Promise<void>((resolve) => {
      markPrompted = resolve;
    });

    void process.output
      .pipeTo(
        new WritableStream<string>({
          write(chunk) {
            for (const listener of listeners) {
              listener(chunk);
            }

            promptTail = (promptTail + chunk).slice(-256);

            if (promptTail.includes('654;prompt')) {
              markPrompted();
            }

            const completed = parser.push(chunk);

            if (completed && pending) {
              const resolve = pending;
              pending = null;
              resolve(completed);
            }
          },
        }),
      )
      .catch(() => {
        killed = true;
        markPrompted();
        pending?.({ output: 'The shell output stream closed unexpectedly.', exitCode: 1 });
        pending = null;
      });
    void process.exit.then(() => {
      killed = true;
      markPrompted();
    });

    const session: ShellSession = {
      id,
      write: (data) => {
        void input.write(data);
      },
      resize: (next) => {
        process.resize({ cols: next.cols, rows: next.rows });
      },
      onOutput: (handler) => {
        listeners.add(handler);

        return () => {
          listeners.delete(handler);
        };
      },
      execute: async (command, execOptions) => {
        const startedAt = Date.now();

        if (executing) {
          throw new Error('A command is already running in this shell.');
        }

        executing = true;

        let onAbort: () => void = () => undefined;
        const aborted = new Promise<null>((resolve) => {
          onAbort = () => resolve(null);
          execOptions?.signal?.addEventListener('abort', onAbort, { once: true });

          if (execOptions?.signal?.aborted) {
            resolve(null);
          }
        });
        const shellEnded = process.exit.then((code) => ({ shellExit: code }) as const);

        try {
          const ready = await Promise.race([prompted.then(() => true), aborted, shellEnded]);

          if (ready === null || execOptions?.signal?.aborted) {
            return { command, exitCode: 130, output: '', durationMs: Date.now() - startedAt, aborted: true };
          }

          if (killed || ready !== true) {
            throw new Error('Shell session has ended');
          }

          parser.reset();

          const completion = new Promise<{ output: string; exitCode: number }>((resolve) => {
            pending = resolve;
          });

          /*
           * This session owns one command at a time. Sending Ctrl-C here can
           * generate a stale completion marker and falsely finish the new one.
           */
          await input.write(`${command}\n`);

          const settled = await Promise.race([completion, aborted, shellEnded]);

          if (settled === null) {
            void input.write('\x03').catch(() => undefined);
            return { command, exitCode: 130, output: '', durationMs: Date.now() - startedAt, aborted: true };
          }

          return {
            command,
            exitCode: 'shellExit' in settled ? settled.shellExit : settled.exitCode,
            output: 'shellExit' in settled ? '' : settled.output,
            durationMs: Date.now() - startedAt,
            aborted: false,
          };
        } finally {
          pending = null;
          executing = false;
          execOptions?.signal?.removeEventListener('abort', onAbort);
        }
      },
      exited: process.exit,
      kill: async () => {
        if (killed) {
          return;
        }

        killed = true;
        markPrompted();
        listeners.clear();

        try {
          process.kill();
        } catch {
          // Already gone.
        }
        void input.close().catch(() => undefined);
      },
    };

    this._shells.set(id, session);

    return session;
  }

  /**
   * Observe workspace changes.
   *
   * `node_modules` and `.git` are excluded: an install writes tens of thousands
   * of files, and forwarding those would flood every consumer with events for
   * paths the product never shows.
   */
  watchFiles(onChange: (changes: FileChange[]) => void): () => void {
    const container = this._requireContainer();
    let disposed = false;

    const watcher = (
      container as unknown as {
        internal?: {
          watchPaths?: (
            options: { include: string[]; exclude: string[]; includeContent: boolean },
            handler: (events: unknown) => void,
          ) => void;
        };
      }
    ).internal?.watchPaths;

    if (typeof watcher !== 'function') {
      // No watch capability; the caller still gets a valid disposer.
      return () => undefined;
    }

    watcher.call(
      (container as unknown as { internal: unknown }).internal,
      {
        include: ['**'],
        exclude: ['**/node_modules/**', '**/.git/**', '**/package-lock.json'],
        includeContent: true,
      },
      (events: unknown) => {
        if (disposed) {
          return;
        }

        const changes = normalizeWatchEvents(events);

        if (changes.length > 0) {
          onChange(changes);
        }
      },
    );

    return () => {
      disposed = true;
    };
  }

  async dispose(): Promise<void> {
    for (const id of [...this._processes.keys()]) {
      await this.stopProcess(id);
    }

    for (const shell of this._shells.values()) {
      await shell.kill();
    }

    this._shells.clear();
    this._processes.clear();
    this._previewPorts.clear();

    try {
      this._container?.teardown();
    } catch {
      // Teardown is best-effort; the page may already be unloading.
    }

    this._container = null;
  }
}

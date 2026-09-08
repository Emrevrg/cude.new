/**
 * Cude.new - in-memory runtime.
 *
 * Backs the pipeline when there is no container: unit tests, the plain-Node
 * verifiers, and SSR — where the inherited implementation resolved a promise
 * that never settled, so any caller reaching it on the server hung forever.
 *
 * Commands are not executed. A caller registers what a command should do, and
 * that is what makes Builder/Tester/Repair behaviour testable: a test can say
 * "this build fails with this output" and assert the pipeline reacts correctly.
 */

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

/** How a registered command behaves when run. */
export interface ScriptedCommand {
  exitCode?: number;
  output?: string;
  durationMs?: number;

  /** Port reported when this command is used to start a preview. */
  port?: number;

  /** Never completes on its own; only stopProcess ends it. */
  longRunning?: boolean;
}

export interface MemoryRuntimeOptions {
  /** Exact command string to behaviour. */
  commands?: Record<string, ScriptedCommand>;

  /** Applied when no exact match is registered. */
  fallback?: ScriptedCommand;
}

export class MemoryRuntime implements CudeRuntime {
  readonly kind = 'memory';

  private _files = new Map<string, string>();
  private _ready = false;
  private _commands: Record<string, ScriptedCommand>;
  private _fallback: ScriptedCommand;
  private _running = new Map<string, { resolve: (r: CommandResult) => void; command: string; startedAt: number }>();
  private _nextId = 1;

  /** Every command run, in order, so tests can assert what the pipeline invoked. */
  readonly invocations: string[] = [];

  private _watchers = new Set<(changes: FileChange[]) => void>();
  private _previewWatchers = new Set<(change: PreviewChange) => void>();
  private _shells = new Map<string, { session: ShellSession; written: string[]; getSize: () => TerminalSize }>();

  constructor(options: MemoryRuntimeOptions = {}) {
    this._commands = options.commands ?? {};
    this._fallback = options.fallback ?? { exitCode: 0, output: '' };
  }

  async initializeWorkspace(): Promise<void> {
    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  private _assertReady() {
    if (!this._ready) {
      /*
       * Said the way a person can act on. This reached the conversation as
       * "A command failed - Cude runtime used before initializeWorkspace()",
       * which names an internal function and asks the reader to know what a
       * workspace is. The cause is fixed — actions wait for the runtime now —
       * but if it ever happens again this should still read as a sentence.
       */
      throw new Error('The workspace is not ready yet. Wait a moment and send the message again.');
    }
  }

  async mountProject(files: WorkspaceFile[]): Promise<void> {
    this._assertReady();

    const removed = [...this._files.keys()];
    this._files.clear();
    await this.writeFiles(files);

    const stillPresent = new Set(this._files.keys());
    this._emit(removed.filter((path) => !stillPresent.has(path)).map((path) => ({ path, kind: 'removed' as const })));
  }

  async writeFiles(files: WorkspaceFile[]): Promise<void> {
    this._assertReady();

    const changes: FileChange[] = [];

    for (const file of files) {
      const path = normalizeWorkspacePath(file.path);
      const existed = this._files.has(path);
      this._files.set(path, file.contents);
      changes.push({ path, kind: existed ? 'changed' : 'added', contents: file.contents });
    }

    this._emit(changes);
  }

  /** Test seam: simulate a change made outside Cude. */
  emitExternalChange(changes: FileChange[]): void {
    for (const change of changes) {
      const path = normalizeWorkspacePath(change.path);

      if (change.kind === 'removed') {
        this._files.delete(path);
      } else if (change.contents !== undefined) {
        this._files.set(path, change.contents);
      }
    }

    this._emit(changes);
  }

  /** A scripted shell, so terminal behaviour is testable without a container. */
  async openShell(options: { size?: TerminalSize } = {}): Promise<ShellSession> {
    this._assertReady();

    const id = `shell-${this._nextId++}`;
    const outputs = new Set<(chunk: string) => void>();
    const written: string[] = [];
    let size: TerminalSize = options.size ?? { cols: 80, rows: 24 };
    let resolveExit!: (code: number) => void;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    let alive = true;

    const emit = (chunk: string) => {
      for (const handler of outputs) {
        handler(chunk);
      }
    };

    const session: ShellSession = {
      id,
      write: (data) => {
        written.push(data);
        emit(data);
      },
      resize: (next) => {
        size = next;
      },
      onOutput: (handler) => {
        outputs.add(handler);

        return () => {
          outputs.delete(handler);
        };
      },
      execute: async (command, execOptions) => {
        if (!alive) {
          throw new Error('Shell session has ended');
        }

        if (execOptions?.signal?.aborted) {
          return { command, exitCode: 0, output: '', durationMs: 0, aborted: true };
        }

        const result = await this.runCommand(command, { onOutput: emit });

        return result;
      },
      exited,
      kill: async () => {
        if (!alive) {
          return;
        }

        alive = false;
        outputs.clear();
        resolveExit(0);
      },
    };

    this._shells.set(id, { session, written, getSize: () => size });

    return session;
  }

  /** Test seam: what was typed into a shell, and its current size. */
  shellState(id: string) {
    const entry = this._shells.get(id);

    return entry ? { written: [...entry.written], size: entry.getSize() } : null;
  }

  watchPreviews(onChange: (change: PreviewChange) => void): () => void {
    this._previewWatchers.add(onChange);

    return () => {
      this._previewWatchers.delete(onChange);
    };
  }

  /** Test seam: announce a preview appearing or going away. */
  emitPreviewChange(change: PreviewChange): void {
    for (const watcher of this._previewWatchers) {
      watcher(change);
    }
  }

  watchFiles(onChange: (changes: FileChange[]) => void): () => void {
    this._watchers.add(onChange);

    return () => {
      this._watchers.delete(onChange);
    };
  }

  private _emit(changes: FileChange[]): void {
    if (changes.length === 0) {
      return;
    }

    for (const watcher of this._watchers) {
      watcher(changes);
    }
  }

  async readFile(path: string): Promise<string | null> {
    this._assertReady();
    return this._files.get(normalizeWorkspacePath(path)) ?? null;
  }

  async listFiles(): Promise<string[]> {
    this._assertReady();
    return [...this._files.keys()].sort();
  }

  private _scriptFor(command: string): ScriptedCommand {
    return this._commands[command] ?? this._fallback;
  }

  async runCommand(command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
    this._assertReady();

    const script = this._scriptFor(command);

    if (script.longRunning) {
      const handle = await this.spawn(command, options);
      return handle.result;
    }

    this.invocations.push(command);

    const output = script.output ?? '';

    if (output && options.onOutput) {
      options.onOutput(output);
    }

    return {
      command,
      exitCode: script.exitCode ?? 0,
      output,
      durationMs: script.durationMs ?? 0,
      aborted: false,
    };
  }

  async spawn(command: string, options: RunCommandOptions = {}): Promise<ProcessHandle> {
    this._assertReady();
    this.invocations.push(command);

    const script = this._scriptFor(command);
    const id = `mem-${this._nextId++}`;
    const startedAt = Date.now();

    if (script.output && options.onOutput) {
      options.onOutput(script.output);
    }

    if (!script.longRunning) {
      return {
        id,
        command,
        result: Promise.resolve({
          command,
          exitCode: script.exitCode ?? 0,
          output: script.output ?? '',
          durationMs: script.durationMs ?? 0,
          aborted: false,
        }),
      };
    }

    let resolve!: (r: CommandResult) => void;
    const result = new Promise<CommandResult>((r) => {
      resolve = r;
    });
    this._running.set(id, { resolve, command, startedAt });

    return { id, command, result };
  }

  async stopProcess(id: string): Promise<void> {
    const entry = this._running.get(id);

    if (!entry) {
      return;
    }

    this._running.delete(id);
    entry.resolve({
      command: entry.command,
      exitCode: 0,
      output: '',
      durationMs: Date.now() - entry.startedAt,
      aborted: true,
    });
  }

  async startPreview(command: string, options: RunCommandOptions = {}): Promise<PreviewHandle> {
    this._assertReady();

    const script = this._scriptFor(command);
    await this.spawn(command, options);

    const port = script.port ?? 5173;

    return { port, url: `http://localhost:${port}` };
  }

  async collectBuildResult(command: string, options: RunCommandOptions = {}): Promise<BuildResult> {
    const result = await this.runCommand(command, options);
    return classifyBuildResult(result);
  }

  async dispose(): Promise<void> {
    for (const id of [...this._running.keys()]) {
      await this.stopProcess(id);
    }

    for (const { session } of this._shells.values()) {
      await session.kill();
    }

    this._previewWatchers.clear();
    this._shells.clear();
    this._files.clear();
    this._watchers.clear();
    this._ready = false;
  }
}

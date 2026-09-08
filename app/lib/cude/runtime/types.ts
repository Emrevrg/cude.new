/**
 * Cude.new - runtime contract.
 *
 * Cude.new needs a workspace it can mount a ProjectManifest into, run build and
 * test commands in, and serve a preview from. That is the whole requirement.
 *
 * The contract is written from those needs rather than from any particular
 * container implementation, which is why it is an interface with a swappable
 * backend: the pipeline (Builder, Tester, Visual QA) has to be verifiable in a
 * plain Node process, where no browser container exists. An implementation that
 * boots itself as a module-level singleton cannot satisfy that, so the runtime
 * is created explicitly and injected.
 */

/** A file to place in the workspace. Directories are implied by the path. */
export interface WorkspaceFile {
  /** Workspace-relative POSIX path, e.g. "src/App.tsx". */
  path: string;
  contents: string;
}

/** Outcome of a command the pipeline ran in the workspace. */
export interface CommandResult {
  command: string;
  exitCode: number;

  /** Combined stdout/stderr, in emission order. */
  output: string;

  /** Wall-clock duration in milliseconds. */
  durationMs: number;

  /** True when the command was stopped by `stopProcess` or a timeout. */
  aborted: boolean;

  /** Distinguishes an elapsed deadline from an explicit user cancellation. */
  timedOut?: boolean;
}

/** What the pipeline records after a build or test step. */
export interface BuildResult {
  succeeded: boolean;
  command: string;
  exitCode: number;
  output: string;
  durationMs: number;

  /** Populated when the runtime could classify the failure. */
  failureKind?: 'command_not_found' | 'non_zero_exit' | 'timeout' | 'runtime_unavailable';
}

/** A running preview server the workspace exposed. */
export interface PreviewHandle {
  port: number;
  url: string;
}

/** A preview server appearing or going away. */
export interface PreviewChange {
  port: number;
  url: string;
  kind: 'ready' | 'closed';
}

export interface RunCommandOptions {
  /** Workspace-relative working directory. Defaults to the workspace root. */
  cwd?: string;
  env?: Record<string, string>;

  /** Abort the command after this many milliseconds. */
  timeoutMs?: number;

  /** Called for each chunk of output as it arrives. */
  onOutput?: (chunk: string) => void;
}

/** A change the runtime observed in the workspace. */
export interface FileChange {
  /** Workspace-relative POSIX path. */
  path: string;
  kind: 'added' | 'changed' | 'removed';

  /** Present for added/changed files the runtime could read. */
  contents?: string;
  isDirectory?: boolean;
}

/** Size of an attached terminal, in character cells. */
export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * An interactive shell in the workspace.
 *
 * Needed because a terminal is not a sequence of one-shot commands: it has
 * stdin, it resizes, and the user's session persists between commands.
 */
export interface ShellSession {
  readonly id: string;

  /** Send input, exactly as typed. */
  write(data: string): void;

  /** Tell the shell the terminal's new size. */
  resize(size: TerminalSize): void;

  /** Observe output. Returns an unsubscribe function. */
  onOutput(handler: (chunk: string) => void): () => void;

  /**
   * Run a command in this session and wait for it to finish.
   *
   * Distinct from `write`: the caller gets the command's output and exit code
   * rather than having to scrape the stream.
   */
  execute(command: string, options?: { signal?: AbortSignal }): Promise<CommandResult>;

  /** Resolves with the shell's exit code when it ends. */
  readonly exited: Promise<number>;

  /** End the session. Safe to call twice. */
  kill(): Promise<void>;
}

/** Handle to a process the caller may stop. */
export interface ProcessHandle {
  id: string;
  command: string;
  result: Promise<CommandResult>;
}

/**
 * The operations Cude.new's pipeline performs against a workspace.
 *
 * Deliberately small: every method here exists because a named stage of the
 * Cude pipeline needs it. Nothing is exposed "because the backend can do it".
 */
export interface CudeRuntime {
  readonly kind: string;

  /** Bring the workspace up. Safe to call more than once. */
  initializeWorkspace(): Promise<void>;

  /** True once the workspace is usable. */
  isReady(): boolean;

  /** Replace the workspace contents with this project. */
  mountProject(files: WorkspaceFile[]): Promise<void>;

  /** Add or overwrite files without clearing the rest of the workspace. */
  writeFiles(files: WorkspaceFile[]): Promise<void>;

  /** Read a file back, or null when it does not exist. */
  readFile(path: string): Promise<string | null>;

  /** List every workspace-relative file path. */
  listFiles(): Promise<string[]>;

  /** Run a command to completion. */
  runCommand(command: string, options?: RunCommandOptions): Promise<CommandResult>;

  /** Start a command without waiting for it, so it can be stopped later. */
  spawn(command: string, options?: RunCommandOptions): Promise<ProcessHandle>;

  /** Stop a process started by `spawn`. Unknown ids are ignored. */
  stopProcess(id: string): Promise<void>;

  /** Start a preview server and resolve once it is serving. */
  startPreview(command: string, options?: RunCommandOptions): Promise<PreviewHandle>;

  /** Run a build/test command and classify the outcome for the pipeline. */
  collectBuildResult(command: string, options?: RunCommandOptions): Promise<BuildResult>;

  /**
   * Observe preview servers starting and stopping.
   *
   * Returns a disposer. A preview can appear without anyone having called
   * `startPreview` — a dev server started from the terminal, for instance — so
   * this is an observation channel rather than a result.
   */
  watchPreviews(onChange: (change: PreviewChange) => void): () => void;

  /**
   * Open an interactive shell.
   *
   * `size` seeds the terminal dimensions so the shell wraps correctly before
   * the first resize arrives.
   */
  openShell(options?: { size?: TerminalSize }): Promise<ShellSession>;

  /**
   * Observe changes to the workspace.
   *
   * Returns a disposer. Callers must be able to stop watching — the inherited
   * implementation started a watcher and a 30-second interval that were never
   * cleared, so both outlived the workspace they were watching.
   */
  watchFiles(onChange: (changes: FileChange[]) => void): () => void;

  /** Release resources. Safe to call when never initialized. */
  dispose(): Promise<void>;
}

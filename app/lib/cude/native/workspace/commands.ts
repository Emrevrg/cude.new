import { workspacePath, workspaceRoot, type WorkspacePath } from './path';

export interface CommandRequest {
  readonly id: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: WorkspacePath;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

export interface CommandResult {
  readonly requestId: string;
  readonly status: 'completed' | 'failed' | 'timed-out' | 'cancelled';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface CommandExecutor {
  execute(request: CommandRequest, signal?: AbortSignal): Promise<CommandResult>;
}

export function commandRequest(input: {
  readonly id: string;
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}): CommandRequest {
  const id = input.id.trim();
  const executable = input.executable.trim();

  if (!id) {
    throw new Error('A command requires a stable request id.');
  }

  if (!executable || /[\r\n\0]/.test(executable)) {
    throw new Error('A command requires a valid executable.');
  }

  if (input.args?.some((argument) => /[\0]/.test(argument))) {
    throw new Error('Command arguments cannot contain null bytes.');
  }

  const timeoutMs = input.timeoutMs ?? 120_000;

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Command timeout must be a positive integer.');
  }

  const env = { ...(input.env ?? {}) };

  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /[\0]/.test(value)) {
      throw new Error(`Invalid command environment entry: ${key}`);
    }
  }

  return Object.freeze({
    id,
    executable,
    args: Object.freeze([...(input.args ?? [])]),
    cwd: input.cwd === undefined || input.cwd === '' ? workspaceRoot() : workspacePath(input.cwd, { allowRoot: true }),
    env: Object.freeze(env),
    timeoutMs,
  });
}

export function commandResult(request: CommandRequest, result: Omit<CommandResult, 'requestId'>): CommandResult {
  if (!Number.isFinite(result.durationMs) || result.durationMs < 0) {
    throw new Error('Command duration cannot be negative.');
  }

  if (result.status === 'completed' && result.exitCode !== 0) {
    throw new Error('Completed commands must have exit code zero.');
  }

  if (result.status === 'failed' && (result.exitCode === null || result.exitCode === 0)) {
    throw new Error('Failed commands require a non-zero exit code.');
  }

  return Object.freeze({ requestId: request.id, ...result });
}

export class FakeCommandExecutor implements CommandExecutor {
  readonly requests: CommandRequest[] = [];
  readonly #results: Array<Omit<CommandResult, 'requestId'>> = [];

  enqueue(result: Omit<CommandResult, 'requestId'>): void {
    this.#results.push(result);
  }

  async execute(request: CommandRequest, signal?: AbortSignal): Promise<CommandResult> {
    this.requests.push(request);

    if (signal?.aborted) {
      return commandResult(request, {
        status: 'cancelled',
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });
    }

    const result = this.#results.shift();

    if (!result) {
      throw new Error(`No fake command result queued for ${request.id}.`);
    }

    return commandResult(request, result);
  }
}

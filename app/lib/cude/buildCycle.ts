/**
 * Cude.new - executable build cycle.
 *
 * `build.ts` could classify a build failure but had no way to cause one: it
 * took an error string from somewhere else. This is the half that was missing —
 * the loop that installs, builds, and hands a failure to Repair, then tries
 * again, bounded by MAX_REPAIR_ATTEMPTS.
 *
 * The runtime is a parameter, not an import. That is what lets the whole
 * self-healing loop be verified deterministically in a plain Node process: the
 * verifiers drive it with MemoryRuntime and assert on the sequence of attempts,
 * rather than needing a browser container to observe a repair.
 */

import type { CudeRuntime } from './runtime/types';
import { classifyError, formatRepairPrompt, MAX_REPAIR_ATTEMPTS, type BuildStatus } from './build';

export interface BuildCycleCommands {
  /** Run when dependencies are missing or changed. */
  install: string;

  /** The build itself. */
  build: string;
}

export const DEFAULT_BUILD_COMMANDS: BuildCycleCommands = {
  install: 'npm install',
  build: 'npm run build',
};

/** One pass through install/build. */
export interface BuildAttempt {
  attempt: number;
  command: string;
  succeeded: boolean;
  exitCode: number;
  output: string;

  /** Error family, when the attempt failed. */
  category?: ReturnType<typeof classifyError>;

  /** Prompt handed to Repair for this failure. */
  repairPrompt?: string;
}

export interface BuildCycleResult {
  status: BuildStatus;
  attempts: BuildAttempt[];

  /** Output of the final attempt. */
  output: string;
  error?: string;
  durationMs: number;

  /** True when a repair callback changed the workspace between attempts. */
  repaired: boolean;
}

export interface RunBuildCycleOptions {
  commands?: Partial<BuildCycleCommands>;

  /** Skip install, e.g. when no dependency changed since the last cycle. */
  skipInstall?: boolean;

  /** Abort a single command after this long. */
  timeoutMs?: number;

  /** Forwarded to the caller so a terminal can show progress live. */
  onOutput?: (chunk: string) => void;

  /** Called between attempts. Return true when the workspace was changed. */
  onRepair?: (context: { prompt: string; category: string; attempt: number; output: string }) => Promise<boolean>;

  /** Reported as the cycle moves between stages. */
  onStatus?: (status: BuildStatus) => void;
}

/**
 * Install and build, repairing and retrying on failure.
 *
 * Stops as soon as the build succeeds, when Repair declines to change anything,
 * or when MAX_REPAIR_ATTEMPTS is reached — a loop that retried an unchanged
 * workspace would just burn provider tokens on an identical failure.
 */
export async function runBuildCycle(
  runtime: CudeRuntime,
  options: RunBuildCycleOptions = {},
): Promise<BuildCycleResult> {
  const commands: BuildCycleCommands = { ...DEFAULT_BUILD_COMMANDS, ...options.commands };
  const startedAt = Date.now();
  const attempts: BuildAttempt[] = [];
  let repaired = false;

  const setStatus = (status: BuildStatus) => options.onStatus?.(status);

  if (!runtime.isReady()) {
    setStatus('failed');

    return {
      status: 'failed',
      attempts,
      output: '',
      error: 'Workspace runtime is not available.',
      durationMs: Date.now() - startedAt,
      repaired: false,
    };
  }

  if (!options.skipInstall) {
    setStatus('installing');

    const install = await runtime.collectBuildResult(commands.install, {
      timeoutMs: options.timeoutMs,
      onOutput: options.onOutput,
    });

    if (!install.succeeded) {
      /*
       * A failed install is not a code defect, so it does not consume a repair
       * attempt — the build never ran.
       */
      attempts.push({
        attempt: 0,
        command: install.command,
        succeeded: false,
        exitCode: install.exitCode,
        output: install.output,
        category: classifyError(install.output),
      });
      setStatus('failed');

      return {
        status: 'failed',
        attempts,
        output: install.output,
        error: `Dependency installation failed: ${install.command}`,
        durationMs: Date.now() - startedAt,
        repaired,
      };
    }
  }

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    setStatus('building');

    const build = await runtime.collectBuildResult(commands.build, {
      timeoutMs: options.timeoutMs,
      onOutput: options.onOutput,
    });

    if (build.succeeded) {
      attempts.push({
        attempt,
        command: build.command,
        succeeded: true,
        exitCode: build.exitCode,
        output: build.output,
      });
      setStatus('success');

      return {
        status: 'success',
        attempts,
        output: build.output,
        durationMs: Date.now() - startedAt,
        repaired,
      };
    }

    const category = classifyError(build.output);
    const repairPrompt = formatRepairPrompt(build.output, category, attempt);

    attempts.push({
      attempt,
      command: build.command,
      succeeded: false,
      exitCode: build.exitCode,
      output: build.output,
      category,
      repairPrompt,
    });

    const isLastAttempt = attempt === MAX_REPAIR_ATTEMPTS;

    if (isLastAttempt || !options.onRepair) {
      break;
    }

    setStatus('repairing');

    const changed = await options.onRepair({
      prompt: repairPrompt,
      category,
      attempt,
      output: build.output,
    });

    if (!changed) {
      // Retrying an unchanged workspace reproduces the same failure exactly.
      break;
    }

    repaired = true;
  }

  const last = attempts[attempts.length - 1];
  setStatus('failed');

  return {
    status: 'failed',
    attempts,
    output: last?.output ?? '',
    error: `Build failed after ${attempts.filter((a) => a.attempt > 0).length} attempt(s).`,
    durationMs: Date.now() - startedAt,
    repaired,
  };
}

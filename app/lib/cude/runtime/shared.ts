/**
 * Cude.new - runtime helpers shared by every backend.
 *
 * Classification lives here rather than in each backend so a build failure
 * looks identical to the pipeline whether it happened in a browser container or
 * in the in-memory runtime the verifiers use.
 */

import type { BuildResult, CommandResult } from './types';
import { WORK_DIR } from '~/lib/cude/constants';

/** The working directory when a caller spelled it out. */
const WORK_DIR_PREFIX = new RegExp(`^${WORK_DIR}(?=/|$)`);

/**
 * Workspace paths are POSIX, relative, and have no leading or trailing slash.
 *
 * A caller may name a file either way — `index.html`, or the absolute
 * `/home/project/index.html` that the container's own file watcher reports it
 * under. Both mean the same file, so the working directory is stripped when it
 * is present. Without that, the absolute form was rooted a second time and the
 * file landed at /home/project/home/project/index.html.
 */
export function normalizeWorkspacePath(path: string): string {
  const posix = path.replace(/\\/g, '/').replace(WORK_DIR_PREFIX, '');
  const segments: string[] = [];

  for (const segment of posix.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      /*
       * Refuse to climb out of the workspace. Generated projects are untrusted
       * input, so a path that walks upward must not resolve outside the mount.
       */
      if (segments.length === 0) {
        throw new Error(`Path escapes the workspace: ${path}`);
      }

      segments.pop();

      continue;
    }

    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new Error(`Not a valid workspace path: ${path}`);
  }

  return segments.join('/');
}

/** Turn a raw command outcome into something the pipeline can act on. */
export function classifyBuildResult(result: CommandResult): BuildResult {
  const base = {
    command: result.command,
    exitCode: result.exitCode,
    output: result.output,
    durationMs: result.durationMs,
  };

  if (result.aborted) {
    return { ...base, succeeded: false, failureKind: 'timeout' as const };
  }

  if (result.exitCode === 0) {
    return { ...base, succeeded: true };
  }

  /*
   * 127 is the shell's "command not found". Distinguishing it matters: Repair
   * should install a missing tool, not try to fix source code.
   */
  if (result.exitCode === 127 || /command not found|not recognized as an internal/i.test(result.output)) {
    return { ...base, succeeded: false, failureKind: 'command_not_found' as const };
  }

  return { ...base, succeeded: false, failureKind: 'non_zero_exit' as const };
}

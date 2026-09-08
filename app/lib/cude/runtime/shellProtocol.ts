/**
 * Cude.new - interactive shell protocol.
 *
 * An interactive shell is a byte stream, not a request/response channel: there
 * is no built-in way to tell where one command's output ends or what it exited
 * with. The workspace shell emits OSC control sequences around each prompt and
 * command, and this module turns that stream into the boundaries and exit codes
 * the pipeline needs.
 *
 * Kept separate from the runtime so the parsing is testable on plain strings,
 * with no container and no terminal.
 */

/** OSC sequences the workspace shell emits, by the marker it carries. */
export const OSC_PREFIX = '\x1b]';
export const OSC_TERMINATORS = ['\x07', '\x1b\\'];

export interface ShellMarker {
  /**
   * Marker name as the shell emits it.
   *
   * Observed from the workspace shell rather than assumed:
   *   `prompt`           the prompt is ready for input
   *   `interactive`      a command has started running
   *   `pid=<n>`          the process id of that command
   *   `exit=<pid>:<code>` the command finished, with its exit code
   */
  kind: string;

  /** Exit code, present on an `exit=` marker. */
  exitCode?: number;
}

/**
 * Marker emitted once, when the shell enters interactive mode.
 *
 * Not a per-command signal: the shell emits it for the first command only,
 * which is why command start is detected from the pid marker below.
 */
export const MARKER_INTERACTIVE = 'interactive';

/** Prefix of the marker that announces the process running a command. */
export const MARKER_PID_PREFIX = 'pid=';

/**
 * True when a marker means a command has begun.
 *
 * Observed from the shell: every command is announced by `pid=<n>`, whereas
 * `interactive` appears only for the first one.
 */
export function isCommandStartMarker(kind: string): boolean {
  return kind === MARKER_INTERACTIVE || kind.startsWith(MARKER_PID_PREFIX);
}

/** Prefix of the marker that carries a command's exit code. */
export const MARKER_EXIT_PREFIX = 'exit=';

/**
 * Read the exit code out of an `exit=<pid>:<code>` marker.
 *
 * Returns null for anything else, so a `pid=` marker is not mistaken for a
 * completion.
 */
export function parseExitMarker(kind: string): number | null {
  if (!kind.startsWith(MARKER_EXIT_PREFIX)) {
    return null;
  }

  const payload = kind.slice(MARKER_EXIT_PREFIX.length);
  const colon = payload.lastIndexOf(':');

  if (colon === -1) {
    return null;
  }

  const code = Number.parseInt(payload.slice(colon + 1), 10);

  return Number.isNaN(code) ? null : code;
}

/**
 * Strip ANSI escape sequences so output can be compared and displayed as text.
 *
 * Deliberately conservative: only well-formed CSI and OSC sequences are
 * removed, so a stray escape byte in program output does not swallow the rest
 * of the line.
 */
export function stripAnsi(input: string): string {
  let out = '';
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (char !== '\x1b') {
      out += char;
      i += 1;
      continue;
    }

    const next = input[i + 1];

    if (next === '[') {
      // CSI: ESC [ params letter
      let j = i + 2;

      while (j < input.length && !/[a-zA-Z]/.test(input[j])) {
        j += 1;
      }

      i = j + 1;
      continue;
    }

    if (next === ']') {
      // OSC: ESC ] ... BEL or ESC \
      let j = i + 2;

      while (j < input.length) {
        if (input[j] === '\x07') {
          j += 1;
          break;
        }

        if (input[j] === '\x1b' && input[j + 1] === '\\') {
          j += 2;
          break;
        }

        j += 1;
      }

      i = j;
      continue;
    }

    // Unrecognised escape; drop the ESC and continue.
    i += 1;
  }

  return out;
}

/**
 * Extract the shell markers present in a chunk.
 *
 * A marker looks like `ESC ] 654 ; <kind> [; <code>] BEL`.
 */
export function parseShellMarkers(chunk: string): ShellMarker[] {
  const markers: ShellMarker[] = [];
  let index = chunk.indexOf(OSC_PREFIX);

  while (index !== -1) {
    let end = -1;

    for (let j = index + OSC_PREFIX.length; j < chunk.length; j++) {
      if (chunk[j] === '\x07') {
        end = j;
        break;
      }

      if (chunk[j] === '\x1b' && chunk[j + 1] === '\\') {
        end = j;
        break;
      }
    }

    if (end === -1) {
      break;
    }

    const body = chunk.slice(index + OSC_PREFIX.length, end);
    const parts = body.split(';');

    if (parts[0] === '654' && parts.length > 1) {
      const kind = parts.slice(1).join(';');
      const marker: ShellMarker = { kind };
      const exitCode = parseExitMarker(kind);

      if (exitCode !== null) {
        marker.exitCode = exitCode;
      }

      markers.push(marker);
    }

    index = chunk.indexOf(OSC_PREFIX, end + 1);
  }

  return markers;
}

/**
 * Accumulates shell output and reports command boundaries.
 *
 * Fed one chunk at a time; reports the output of each completed command and
 * the exit code the shell announced.
 */

interface LocatedMarker {
  marker: ShellMarker;
  start: number;
  end: number;
}

/** Find the next shell marker at or after `from`, with its bounds. */
function findNextMarker(chunk: string, from: number): LocatedMarker | null {
  let index = chunk.indexOf(OSC_PREFIX, from);

  while (index !== -1) {
    let end = -1;
    let terminatorLength = 0;

    for (let j = index + OSC_PREFIX.length; j < chunk.length; j++) {
      if (chunk[j] === '\x07') {
        end = j;
        terminatorLength = 1;
        break;
      }

      if (chunk[j] === '\x1b' && chunk[j + 1] === '\\') {
        end = j;
        terminatorLength = 2;
        break;
      }
    }

    if (end === -1) {
      return null;
    }

    const body = chunk.slice(index + OSC_PREFIX.length, end);
    const parts = body.split(';');

    if (parts[0] === '654' && parts.length > 1) {
      const kind = parts.slice(1).join(';');
      const marker: ShellMarker = { kind };
      const exitCode = parseExitMarker(kind);

      if (exitCode !== null) {
        marker.exitCode = exitCode;
      }

      return { marker, start: index, end: end + terminatorLength };
    }

    index = chunk.indexOf(OSC_PREFIX, end + 1);
  }

  return null;
}

export class ShellOutputParser {
  private _buffer = '';
  private _capturing = false;
  private _partial = '';

  /**
   * Feed a chunk. Returns a completed command, if this chunk finished one.
   *
   * Capture starts immediately *after* the start marker and stops at the exit
   * marker, so the prompt and the shell's echo of the command line never end up
   * in what the caller is told the command printed.
   */
  push(chunk: string): { output: string; exitCode: number } | null {
    chunk = this._partial + chunk;
    this._partial = '';

    let cursor = 0;

    while (cursor <= chunk.length) {
      const found = findNextMarker(chunk, cursor);

      if (!found) {
        /*
         * Stream chunks can end anywhere, including halfway through an OSC
         * marker or between ESC and ]. Keep that suffix for the next chunk.
         */
        const osc = chunk.lastIndexOf(OSC_PREFIX);
        const tail = chunk.slice(osc + OSC_PREFIX.length);
        const end =
          osc >= cursor && !tail.includes('\x07') && !tail.includes('\x1b\\')
            ? osc
            : chunk.endsWith('\x1b')
              ? chunk.length - 1
              : chunk.length;

        if (this._capturing) {
          this._buffer += chunk.slice(cursor, end);
        }

        this._partial = chunk.slice(end);

        return null;
      }

      if (this._capturing) {
        this._buffer += chunk.slice(cursor, found.start);
      }

      cursor = found.end;

      if (isCommandStartMarker(found.marker.kind)) {
        this._capturing = true;
        this._buffer = '';
        continue;
      }

      if (found.marker.exitCode !== undefined && this._capturing) {
        const output = this._finish();

        return { output, exitCode: found.marker.exitCode };
      }
    }

    return null;
  }

  private _finish(): string {
    const text = stripAnsi(this._buffer);
    this._capturing = false;
    this._buffer = '';

    /*
     * What remains starts with the newline the shell prints after echoing the
     * command, and ends before the next prompt.
     */
    return text.replace(/\r/g, '').replace(/^\n+/, '').trimEnd();
  }

  reset(): void {
    this._buffer = '';
    this._capturing = false;
    this._partial = '';
  }
}

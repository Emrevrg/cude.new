/**
 * Cude.new - shell protocol behaviour.
 *
 * Command boundaries and exit codes are the only way the pipeline knows whether
 * something a shell ran actually succeeded, so the parsing is tested on plain
 * strings rather than through a container.
 */

import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  parseShellMarkers,
  parseExitMarker,
  isCommandStartMarker,
  ShellOutputParser,
} from './shellProtocol';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/** Markers exactly as the workspace shell emits them. */
const marker = (kind: string) => `${ESC}]654;${kind}${BEL}`;
const started = () => marker('interactive');

/*
 * The shell echoes the command line *before* it emits `interactive`, so output
 * capture begins after that marker. Fixtures mirror the observed order.
 */
const ran = (command: string) => `${marker('prompt')}${command}

${started()}${marker('pid=-1')}`;
const finished = (code: number) => marker(`exit=-1:${code}`);

describe('stripAnsi', () => {
  it('leaves plain text alone', () => {
    expect(stripAnsi('built in 1.2s')).toBe('built in 1.2s');
  });

  it('removes colour sequences', () => {
    expect(stripAnsi(`${ESC}[31merror${ESC}[0m`)).toBe('error');
  });

  it('removes OSC sequences terminated by BEL', () => {
    expect(stripAnsi(`before${started()}after`)).toBe('beforeafter');
  });

  it('removes OSC sequences terminated by ESC backslash', () => {
    expect(stripAnsi(`a${ESC}]0;title${ESC}\\b`)).toBe('ab');
  });

  it('does not swallow the rest of the line on a stray escape', () => {
    // A lone ESC in program output must not eat everything after it.
    expect(stripAnsi(`keep${ESC}this`)).toBe('keepthis');
  });

  it('preserves newlines and tabs', () => {
    expect(stripAnsi('a\n\tb')).toBe('a\n\tb');
  });
});

describe('parseShellMarkers', () => {
  it('finds a marker with no exit code', () => {
    expect(parseShellMarkers(started())).toEqual([{ kind: 'interactive' }]);
  });

  it('finds a marker carrying an exit code', () => {
    expect(parseShellMarkers(finished(3))).toEqual([{ kind: 'exit=-1:3', exitCode: 3 }]);
  });

  it('does not mistake a pid marker for a completion', () => {
    // `pid=` and `exit=` look alike; only the latter ends a command.
    expect(parseShellMarkers(marker('pid=42'))[0].exitCode).toBeUndefined();
  });

  it('reads the exit code out of the exit marker payload', () => {
    expect(parseExitMarker('exit=-1:0')).toBe(0);
    expect(parseExitMarker('exit=17:130')).toBe(130);
    expect(parseExitMarker('pid=17')).toBeNull();
    expect(parseExitMarker('interactive')).toBeNull();
  });

  it('reads a zero exit code rather than treating it as absent', () => {
    expect(parseShellMarkers(finished(0))[0].exitCode).toBe(0);
  });

  it('finds several markers in one chunk', () => {
    const chunk = `${started()}output${finished(0)}`;

    expect(parseShellMarkers(chunk).map((m) => m.kind)).toEqual(['interactive', 'exit=-1:0']);
  });

  it('ignores unrelated OSC sequences', () => {
    expect(parseShellMarkers(`${ESC}]0;window title${BEL}`)).toEqual([]);
  });

  it('ignores an unterminated sequence rather than hanging', () => {
    expect(parseShellMarkers(`${ESC}]654;exit=-1:0`)).toEqual([]);
  });

  it('returns nothing for ordinary output', () => {
    expect(parseShellMarkers('just some text')).toEqual([]);
  });
});

describe('command start detection', () => {
  it('treats the per-command pid marker as a start', () => {
    /*
     * Observed from the shell: `interactive` is emitted only for the first
     * command, while `pid=` announces every one. Keying off `interactive`
     * alone left every command after the first with no captured output and no
     * completion, so the caller waited forever.
     */
    expect(isCommandStartMarker('pid=-1')).toBe(true);
    expect(isCommandStartMarker('pid=42')).toBe(true);
  });

  it('still accepts the one-off interactive marker', () => {
    expect(isCommandStartMarker('interactive')).toBe(true);
  });

  it('does not treat a prompt or an exit as a start', () => {
    expect(isCommandStartMarker('prompt')).toBe(false);
    expect(isCommandStartMarker('exit=-1:0')).toBe(false);
  });
});

describe('ShellOutputParser', () => {
  it('recognizes command markers at every possible stream split', () => {
    const stream = `${marker('pid=42')}installed\n${marker('exit=42:0')}`;

    for (let split = 1; split < stream.length; split++) {
      const parser = new ShellOutputParser();
      const first = parser.push(stream.slice(0, split));
      const second = parser.push(stream.slice(split));
      expect(first ?? second, `split at byte ${split}`).toEqual({ output: 'installed', exitCode: 0 });
    }
  });

  it('handles byte-by-byte delivery with the two-byte OSC terminator', () => {
    const parser = new ShellOutputParser();
    const stream = '\x1b]654;pid=42\x1b\\built\n\x1b]654;exit=42:2\x1b\\';
    const results = [...stream].map((byte) => parser.push(byte)).filter(Boolean);
    expect(results).toEqual([{ output: 'built', exitCode: 2 }]);
  });

  it('reports every command in a session, not just the first', () => {
    // Regression: the second command in a session never completed.
    const parser = new ShellOutputParser();
    parser.push(ran('first'));

    const one = parser.push(`1
${finished(0)}`);

    // The shell emits no `interactive` for later commands.
    parser.push(`${marker('prompt')}second

${marker('pid=-2')}`);

    const two = parser.push(`2
${marker('exit=-2:0')}`);

    expect(one).toEqual({ output: '1', exitCode: 0 });
    expect(two).toEqual({ output: '2', exitCode: 0 });
  });

  it('reports nothing until a command completes', () => {
    const parser = new ShellOutputParser();

    expect(parser.push(started())).toBeNull();
    expect(parser.push('partial output')).toBeNull();
  });

  it('reports the output and exit code of a completed command', () => {
    const parser = new ShellOutputParser();
    parser.push(ran('pnpm build'));

    const done = parser.push(`built in 1.2s\n${finished(0)}`);

    expect(done).toEqual({ output: 'built in 1.2s', exitCode: 0 });
  });

  it('reports a non-zero exit code', () => {
    const parser = new ShellOutputParser();
    parser.push(ran('pnpm build'));

    const done = parser.push(`error TS2304\n${finished(2)}`);

    expect(done?.exitCode).toBe(2);
    expect(done?.output).toContain('TS2304');
  });

  it('drops the echoed command line from the captured output', () => {
    const parser = new ShellOutputParser();
    parser.push(ran('echo hello'));

    const done = parser.push(`hello\n${finished(0)}`);

    expect(done?.output).toBe('hello');
  });

  it('ignores output emitted before a command started', () => {
    const parser = new ShellOutputParser();
    parser.push('banner text from the shell starting up\n');
    parser.push(ran('ls'));

    const done = parser.push(`file.txt\n${finished(0)}`);

    expect(done?.output).not.toContain('banner');
  });

  it('handles back-to-back commands', () => {
    const parser = new ShellOutputParser();
    parser.push(ran('first'));

    const one = parser.push(`1\n${finished(0)}`);
    parser.push(ran('second'));

    const two = parser.push(`2\n${finished(1)}`);

    expect(one).toEqual({ output: '1', exitCode: 0 });
    expect(two).toEqual({ output: '2', exitCode: 1 });
  });

  it('handles a command that starts and finishes in one chunk', () => {
    const parser = new ShellOutputParser();
    const done = parser.push(`${ran('ls')}file.txt\n${finished(0)}`);

    expect(done).toEqual({ output: 'file.txt', exitCode: 0 });
  });

  it('forgets partial state on reset', () => {
    const parser = new ShellOutputParser();
    parser.push(`${ran('half')}partial output`);
    parser.reset();

    /*
     * After a reset there is no command in flight, so a stray completion
     * marker must be ignored rather than reported as an empty result.
     */
    expect(parser.push(finished(0))).toBeNull();
  });
});

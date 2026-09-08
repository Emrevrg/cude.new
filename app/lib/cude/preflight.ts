/**
 * Cude.new - reading the project before it is built again.
 *
 * A quick, local pre-flight: the file count, the byte total, the places
 * already known to be risky — empty starter traps, leftover secrets in the
 * file map. Nothing is executed. It runs in the browser in milliseconds so
 * the person knows what they are about to send and what the builder will
 * inherit.
 */

import type { FileMap } from '~/lib/cude/state/workspace';

interface PreFlightIssue {
  level: 'warning' | 'info';
  message: string;
}

export interface PreFlightReport {
  files: number;
  bytes: number;
  issues: PreFlightIssue[];
}

const SUSPICIOUS_PATTERNS: Array<{ test: RegExp; why: string }> = [
  { test: /sk-[A-Za-z0-9]{20,}/, why: 'A string that looks like an API key is inside a workspace file.' },
  {
    test: /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/,
    why: 'A private key is inside a workspace file.',
  },
];

/** A fast, synchronous read of the workspace as it stands. */
export function preFlight(files: FileMap): PreFlightReport {
  const entries = Object.entries(files ?? {});
  const issues: PreFlightIssue[] = [];
  let bytes = 0;
  let fileCount = 0;

  for (const [path, file] of entries) {
    if (file?.type !== 'file' || typeof (file as { content?: unknown }).content !== 'string') {
      continue;
    }

    const content = (file as { content: string }).content;
    fileCount += 1;
    bytes += new TextEncoder().encode(content).byteLength;

    for (const { test, why } of SUSPICIOUS_PATTERNS) {
      if (test.test(content)) {
        issues.push({ level: 'warning', message: `${path}: ${why}` });
        break;
      }
    }
  }

  if (entries.length === 0) {
    issues.push({ level: 'info', message: 'The workspace is empty. The builder starts from the starter template.' });
  }

  return { files: fileCount, bytes, issues };
}

/**
 * Cude.new - event log export.
 *
 * Serialising the journal so it can leave the app: pasted into an issue, fed to
 * a script, or kept alongside a build.
 *
 * Pure functions over an array of events, with no DOM and no document library,
 * so the formats are testable and the surface that offers them stays a thin
 * layer of buttons. The inherited tab carried roughly 250 lines of PDF
 * table-layout code to print a log.
 */

import type { CudeEvent } from './eventLog';

/** Newline-safe, quote-safe CSV field. */
function csvField(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export const CSV_COLUMNS = ['timestamp', 'level', 'source', 'stage', 'agent', 'message', 'durationMs'] as const;

/** Events as CSV, with a header row. */
export function toCsv(events: CudeEvent[]): string {
  const rows = [CSV_COLUMNS.join(',')];

  for (const event of events) {
    rows.push(
      [
        csvField(event.timestamp),
        csvField(event.level),
        csvField(event.source),
        csvField(event.stage),
        csvField(event.agent),
        csvField(event.message),
        csvField(event.durationMs),
      ].join(','),
    );
  }

  return rows.join('\n');
}

/** Events as pretty JSON. */
export function toJson(events: CudeEvent[]): string {
  return JSON.stringify(events, null, 2);
}

/** One event as a single readable line. */
export function formatEventLine(event: CudeEvent): string {
  const parts = [event.timestamp, `[${event.level.toUpperCase()}]`, `(${event.source})`];

  if (event.stage) {
    parts.push(`stage=${event.stage}`);
  }

  if (event.agent) {
    parts.push(`agent=${event.agent}`);
  }

  parts.push(event.message);

  if (event.durationMs !== undefined) {
    parts.push(`(${event.durationMs}ms)`);
  }

  return parts.join(' ');
}

/** Events as plain text, one per line. */
export function toText(events: CudeEvent[]): string {
  return events.map(formatEventLine).join('\n');
}

export type ExportFormat = 'json' | 'csv' | 'text';

export interface ExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

/** Serialise the journal in the requested format. */
export function exportEvents(events: CudeEvent[], format: ExportFormat, now = new Date()): ExportResult {
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  switch (format) {
    case 'csv':
      return { filename: `cude-events-${stamp}.csv`, mimeType: 'text/csv', content: toCsv(events) };
    case 'text':
      return { filename: `cude-events-${stamp}.txt`, mimeType: 'text/plain', content: toText(events) };
    case 'json':
    default:
      return { filename: `cude-events-${stamp}.json`, mimeType: 'application/json', content: toJson(events) };
  }
}

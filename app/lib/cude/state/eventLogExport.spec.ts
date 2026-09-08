/**
 * Cude.new - event log export behaviour.
 *
 * The CSV escaping tests matter most: a log message routinely contains commas,
 * quotes and newlines, and a naive join produces a file that silently parses
 * into the wrong columns.
 */

import { describe, it, expect } from 'vitest';
import { toCsv, toJson, toText, formatEventLine, exportEvents, CSV_COLUMNS } from './eventLogExport';
import type { CudeEvent } from './eventLog';

function event(overrides: Partial<CudeEvent> = {}): CudeEvent {
  return {
    id: 'evt-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'info',
    source: 'pipeline',
    message: 'built in 1.2s',
    ...overrides,
  };
}

describe('CSV', () => {
  it('writes a header row', () => {
    expect(toCsv([]).split('\n')[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('quotes every field so a comma in a message cannot shift columns', () => {
    const csv = toCsv([event({ message: 'failed, then retried' })]);
    const row = csv.split('\n')[1];

    expect(row).toContain('"failed, then retried"');
    expect(row.split('","')).toHaveLength(CSV_COLUMNS.length);
  });

  it('doubles embedded quotes rather than truncating the field', () => {
    const csv = toCsv([event({ message: 'cannot find "App.tsx"' })]);

    expect(csv).toContain('"cannot find ""App.tsx"""');
  });

  it('keeps a multi-line message inside one quoted field', () => {
    const csv = toCsv([event({ message: 'line one\nline two' })]);

    expect(csv).toContain('"line one\nline two"');
  });

  it('renders absent optional fields as empty, not "undefined"', () => {
    const csv = toCsv([event()]);

    expect(csv).not.toContain('undefined');
    expect(csv).toContain('""');
  });

  it('includes the stage and agent when present', () => {
    const csv = toCsv([event({ stage: 'design_review', agent: 'Design Director' })]);

    expect(csv).toContain('"design_review"');
    expect(csv).toContain('"Design Director"');
  });
});

describe('JSON', () => {
  it('round-trips the events', () => {
    const events = [event(), event({ id: 'evt-2', level: 'error', message: 'boom' })];

    expect(JSON.parse(toJson(events))).toEqual(events);
  });

  it('is indented, because a log gets read by a person', () => {
    expect(toJson([event()])).toContain('\n  ');
  });
});

describe('text', () => {
  it('puts the level, source and message on one line', () => {
    const line = formatEventLine(event());

    expect(line).toContain('[INFO]');
    expect(line).toContain('(pipeline)');
    expect(line).toContain('built in 1.2s');
  });

  it('adds the stage and agent when an event has them', () => {
    const line = formatEventLine(event({ stage: 'building', agent: 'Builder' }));

    expect(line).toContain('stage=building');
    expect(line).toContain('agent=Builder');
  });

  it('adds a duration when one was measured', () => {
    expect(formatEventLine(event({ durationMs: 1200 }))).toContain('(1200ms)');
  });

  it('writes one line per event', () => {
    expect(toText([event(), event({ id: 'evt-2' })]).split('\n')).toHaveLength(2);
  });

  it('returns nothing for an empty journal', () => {
    expect(toText([])).toBe('');
  });
});

describe('exportEvents', () => {
  const at = new Date('2026-03-04T05:06:07.008Z');

  it('names the file with the format and a timestamp', () => {
    expect(exportEvents([], 'json', at).filename).toBe('cude-events-2026-03-04T05-06-07-008Z.json');
    expect(exportEvents([], 'csv', at).filename.endsWith('.csv')).toBe(true);
    expect(exportEvents([], 'text', at).filename.endsWith('.txt')).toBe(true);
  });

  it('sets a mime type the browser will treat correctly', () => {
    expect(exportEvents([], 'json', at).mimeType).toBe('application/json');
    expect(exportEvents([], 'csv', at).mimeType).toBe('text/csv');
    expect(exportEvents([], 'text', at).mimeType).toBe('text/plain');
  });

  it('falls back to JSON for an unknown format', () => {
    expect(exportEvents([event()], 'yaml' as never, at).mimeType).toBe('application/json');
  });

  it('exports the events it was given', () => {
    const result = exportEvents([event({ message: 'exported' })], 'text', at);

    expect(result.content).toContain('exported');
  });
});

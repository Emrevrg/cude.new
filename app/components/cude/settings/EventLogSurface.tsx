/**
 * Cude.new - event log surface.
 *
 * Reads the pipeline journal and lets it be filtered by level, by source, and
 * by pipeline stage — because the question a user actually has is "what
 * happened during design review", not "show me every warning ever".
 *
 * Filtering runs through the log's own `query`, so the surface holds no copy of
 * the journal and cannot drift from it.
 */

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { cudeEventLog, type CudeEvent, type EventLevel, type EventSource } from '~/lib/cude/state/eventLog';
import { eventLogAtom } from '~/lib/cude/state/logStoreAdapter';
import { exportEvents, type ExportFormat } from '~/lib/cude/state/eventLogExport';

const LEVELS: Array<{ id: EventLevel | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
  { id: 'success', label: 'Success' },
  { id: 'info', label: 'Info' },
  { id: 'debug', label: 'Debug' },
];

const SOURCES: Array<{ id: EventSource | 'all'; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'agent', label: 'Agents' },
  { id: 'provider', label: 'Providers' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'build', label: 'Build' },
  { id: 'design', label: 'Design' },
  { id: 'persistence', label: 'Storage' },
  { id: 'settings', label: 'Settings' },
  { id: 'system', label: 'System' },
];

/** Monochrome level styling; only errors and warnings carry colour. */
const LEVEL_STYLE: Record<EventLevel, string> = {
  error: 'text-cude-item-contentDanger border-red-500/30 bg-cude-item-contentDanger/5',
  warning: 'text-amber-500 border-amber-500/30 bg-amber-500/5',
  success: 'text-cude-icon-success border-emerald-500/25 bg-cude-item-backgroundAccent',
  info: 'text-cude-textSecondary border-cude-borderColor',
  debug: 'text-cude-textTertiary border-cude-borderColor',
};

function EventRow({ event }: { event: CudeEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = event.detail !== undefined && Object.keys(event.detail).length > 0;

  return (
    <div
      className={classNames(
        'rounded-lg border px-3 py-2.5 transition-colors',
        'bg-cude-background-depth-2',
        LEVEL_STYLE[event.level],
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">{event.level}</span>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-cude-textPrimary break-words">{event.message}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-cude-textTertiary">
            <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
            <span>·</span>
            <span>{event.source}</span>
            {event.stage && (
              <>
                <span>·</span>
                <span>stage {event.stage}</span>
              </>
            )}
            {event.agent && (
              <>
                <span>·</span>
                <span>{event.agent}</span>
              </>
            )}
            {event.durationMs !== undefined && (
              <>
                <span>·</span>
                <span>{event.durationMs}ms</span>
              </>
            )}
          </div>

          {hasDetail && (
            <>
              <button
                onClick={() => setExpanded((value) => !value)}
                className="mt-2 text-[11px] text-cude-textSecondary hover:text-cude-textPrimary transition-colors"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>

              {expanded && (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-cude-background-depth-3 p-2 text-[11px] text-cude-textSecondary">
                  {JSON.stringify(event.detail, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EventLogSurface() {
  /*
   * Subscribing keeps the surface live. The query below is the source of truth
   * for what is shown, so the journal is never copied into component state.
   */
  const journal = useStore(eventLogAtom);

  const [level, setLevel] = useState<EventLevel | 'all'>('all');
  const [source, setSource] = useState<EventSource | 'all'>('all');
  const [search, setSearch] = useState('');

  const events = useMemo(
    () =>
      cudeEventLog.query({
        level: level === 'all' ? undefined : level,
        source: source === 'all' ? undefined : source,
        search: search.trim() || undefined,
      }),
    [level, source, search, journal],
  );

  const download = useCallback(
    (format: ExportFormat) => {
      const { filename, mimeType, content } = exportEvents(events, format);
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    [events],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as EventLevel | 'all')}
          aria-label="Filter by level"
          className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-2.5 py-1.5 text-sm text-cude-textPrimary"
        >
          {LEVELS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => setSource(e.target.value as EventSource | 'all')}
          aria-label="Filter by source"
          className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-2.5 py-1.5 text-sm text-cude-textPrimary"
        >
          {SOURCES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          aria-label="Search event messages"
          className="min-w-[180px] flex-1 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-1.5 text-sm text-cude-textPrimary placeholder:text-cude-textTertiary"
        />

        <div className="flex items-center gap-1">
          {(['json', 'csv', 'text'] as ExportFormat[]).map((format) => (
            <button
              key={format}
              onClick={() => download(format)}
              disabled={events.length === 0}
              className={classNames(
                'rounded-lg border border-cude-borderColor px-2.5 py-1.5 text-xs uppercase',
                'text-cude-textSecondary hover:text-cude-textPrimary',
                'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
              )}
            >
              {format}
            </button>
          ))}

          <button
            onClick={() => cudeEventLog.clear()}
            className="rounded-lg border border-cude-borderColor px-2.5 py-1.5 text-xs text-cude-textSecondary hover:text-cude-textPrimary transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <p className="text-xs text-cude-textTertiary">
        {events.length === 0
          ? 'No events match these filters.'
          : `${events.length} event${events.length === 1 ? '' : 's'}, newest first.`}
      </p>

      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

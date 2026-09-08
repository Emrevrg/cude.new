/**
 * Cude.new - call-site compatible facade over the event log.
 *
 * Seventeen files call `logStore.logError(...)` and friends. Rewriting all of
 * those call sites at once would be a large, risky change that buys nothing:
 * what mattered was replacing the *implementation*, so that every one of those
 * calls is redacted and lands in Cude's pipeline event log.
 *
 * Each method maps the old call shape onto a Cude event with a real source, so
 * the log is queryable by pipeline stage rather than by an ad-hoc category
 * string.
 */

import { atom } from 'nanostores';
import { cudeEventLog, type CudeEvent, type EventSource } from './eventLog';

/**
 * Reactive view of the log, for components that render it.
 *
 * The event log itself stays free of any UI framework; this atom is the one
 * place the two are joined.
 */
export const eventLogAtom = atom<CudeEvent[]>(cudeEventLog.events);

cudeEventLog.subscribe((events) => eventLogAtom.set(events));

type Details = Record<string, unknown> | undefined;

/** Extra fields callers may attach; `stage` and `agent` are Cude's own. */
function context(details: Details): { detail?: Record<string, unknown>; stage?: string; agent?: string } {
  if (!details) {
    return {};
  }

  const { stage, agent, ...rest } = details as Record<string, unknown> & { stage?: string; agent?: string };

  return {
    stage: typeof stage === 'string' ? stage : undefined,
    agent: typeof agent === 'string' ? agent : undefined,
    detail: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

function write(level: 'debug' | 'info' | 'success' | 'warning' | 'error', source: EventSource) {
  return (message: string, details?: Details): CudeEvent =>
    cudeEventLog.append({ level, source, message, ...context(details) });
}

export const logStore = {
  /** Reactive view of every recorded event, newest first. */
  logs: eventLogAtom,

  /** Snapshot of the events, for non-reactive callers. */
  get entries(): CudeEvent[] {
    return cudeEventLog.events;
  },

  get unreadCount(): number {
    return cudeEventLog.unreadCount;
  },

  logSystem: write('info', 'system'),
  logInfo: write('info', 'pipeline'),
  logSuccess: write('success', 'pipeline'),
  logWarning: write('warning', 'pipeline'),
  logProvider: write('info', 'provider'),

  logError(message: string, error?: unknown, details?: Details) {
    return cudeEventLog.error('system', message, error, context(details));
  },

  logPerformanceMetric(component: string, operation: string, durationMs: number, details?: Details) {
    return cudeEventLog.append({
      level: 'info',
      source: 'system',
      message: `${component}: ${operation}`,
      durationMs,
      ...context(details),
    });
  },

  isRead(id: string): boolean {
    return !cudeEventLog.isUnread(id);
  },

  markAsRead(id: string): void {
    cudeEventLog.markRead(id);
  },

  markAllAsRead(): void {
    cudeEventLog.markAllRead();
  },

  clearLogs(): void {
    cudeEventLog.clear();
  },

  /**
   * Present so existing call sites keep working. The log is in memory and
   * always current, so there is nothing to refresh.
   */
  refreshLogs(): CudeEvent[] {
    return cudeEventLog.events;
  },

  /** Alias kept for call sites that read the raw list. */
  getLogs(): CudeEvent[] {
    return cudeEventLog.events;
  },

  subscribe(listener: (events: CudeEvent[]) => void): () => void {
    return cudeEventLog.subscribe(listener);
  },
};

export type { CudeEvent as LogEntry } from './eventLog';

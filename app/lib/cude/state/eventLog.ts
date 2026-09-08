/**
 * Cude.new - pipeline event log.
 *
 * Cude's events belong to a pipeline: a stage ran, an agent reported, a
 * provider call failed, a build was repaired. The log is organised around that
 * rather than around a flat list of severity levels, so the Agents and Event
 * Logs surfaces can ask "what happened during design review" and get an answer.
 *
 * Every write is redacted. This is the single most important property here: the
 * inherited log store applied no redaction at all, while `logError` was called
 * 26 times across the app — frequently with provider errors, whose messages
 * routinely embed the API key or the Authorization header. Those entries were
 * rendered in the Event Logs tab and travelled into exports.
 */

import { redactSecrets } from '~/lib/modules/llm/provider-errors';

export type EventLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

/** Where an event came from, in Cude's own vocabulary. */
export type EventSource =
  | 'pipeline'
  | 'agent'
  | 'provider'
  | 'workspace'
  | 'build'
  | 'design'
  | 'persistence'
  | 'settings'
  | 'system';

export interface CudeEvent {
  id: string;
  timestamp: string;
  level: EventLevel;
  source: EventSource;
  message: string;

  /** Pipeline stage this happened during, when there was one. */
  stage?: string;

  /** Agent that reported it, when an agent did. */
  agent?: string;

  /** Structured context. Redacted like everything else. */
  detail?: Record<string, unknown>;

  /** Milliseconds, for events that measured something. */
  durationMs?: number;
}

export interface EventQuery {
  level?: EventLevel | EventLevel[];
  source?: EventSource | EventSource[];
  stage?: string;

  /** Case-insensitive substring match against the message. */
  search?: string;
  limit?: number;
}

/**
 * How many events are retained.
 *
 * A log that grows without bound is a memory leak in a long session and, once
 * persisted, an ever-growing blob in storage.
 */
export const MAX_EVENTS = 1000;

/** Redact a value of any shape, recursively. */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactValue(inner);
    }

    return out as T;
  }

  return value;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `evt-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export interface AppendEvent {
  level: EventLevel;
  source: EventSource;
  message: string;
  stage?: string;
  agent?: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
}

type Listener = (events: CudeEvent[]) => void;

export class CudeEventLog {
  private _events: CudeEvent[] = [];
  private _listeners = new Set<Listener>();
  private _unread = new Set<string>();

  constructor(private readonly _max: number = MAX_EVENTS) {}

  /** Newest first. */
  get events(): CudeEvent[] {
    return [...this._events];
  }

  get unreadCount(): number {
    return this._unread.size;
  }

  /** Record an event. Message and detail are redacted before storage. */
  append(input: AppendEvent): CudeEvent {
    const event: CudeEvent = {
      id: nextId(),
      timestamp: new Date().toISOString(),
      level: input.level,
      source: input.source,
      message: redactSecrets(input.message),
      stage: input.stage,
      agent: input.agent,
      detail: input.detail ? redactValue(input.detail) : undefined,
      durationMs: input.durationMs,
    };

    this._events.unshift(event);

    if (this._events.length > this._max) {
      const dropped = this._events.splice(this._max);

      for (const old of dropped) {
        this._unread.delete(old.id);
      }
    }

    this._unread.add(event.id);
    this._emit();

    return event;
  }

  /** Record an error from anything that was thrown. */
  error(
    source: EventSource,
    message: string,
    cause?: unknown,
    extra?: Omit<AppendEvent, 'level' | 'source' | 'message'>,
  ) {
    const detail: Record<string, unknown> = { ...extra?.detail };

    if (cause instanceof Error) {
      detail.error = cause.message;

      if (cause.stack) {
        detail.stack = cause.stack;
      }
    } else if (cause !== undefined) {
      detail.error = String(cause);
    }

    return this.append({ ...extra, level: 'error', source, message, detail });
  }

  /** Events matching a query, newest first. */
  query(q: EventQuery = {}): CudeEvent[] {
    const levels = q.level ? (Array.isArray(q.level) ? q.level : [q.level]) : null;
    const sources = q.source ? (Array.isArray(q.source) ? q.source : [q.source]) : null;
    const search = q.search?.toLowerCase();

    const matched = this._events.filter((event) => {
      if (levels && !levels.includes(event.level)) {
        return false;
      }

      if (sources && !sources.includes(event.source)) {
        return false;
      }

      if (q.stage && event.stage !== q.stage) {
        return false;
      }

      if (search && !event.message.toLowerCase().includes(search)) {
        return false;
      }

      return true;
    });

    return q.limit ? matched.slice(0, q.limit) : matched;
  }

  isUnread(id: string): boolean {
    return this._unread.has(id);
  }

  markRead(id: string): void {
    if (this._unread.delete(id)) {
      this._emit();
    }
  }

  markAllRead(): void {
    if (this._unread.size === 0) {
      return;
    }

    this._unread.clear();
    this._emit();
  }

  clear(): void {
    this._events = [];
    this._unread.clear();
    this._emit();
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    listener(this.events);

    return () => {
      this._listeners.delete(listener);
    };
  }

  private _emit() {
    const snapshot = this.events;

    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }
}

/** The application's event log. */
export const cudeEventLog = new CudeEventLog();

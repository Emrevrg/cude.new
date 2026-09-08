/**
 * Cude.new - event log behaviour.
 *
 * The redaction tests are the point of this file. The inherited log store
 * applied none, and `logError` was called across the app with provider errors
 * whose messages carry the API key — entries that were then rendered in the
 * Event Logs tab and included in exports.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CudeEventLog, redactValue, MAX_EVENTS } from './eventLog';

const OPENAI_KEY = 'sk-abcdefghijklmnopqrstuvwxyz012345';
const ANTHROPIC_KEY = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789';

describe('redaction', () => {
  let log: CudeEventLog;

  beforeEach(() => {
    log = new CudeEventLog();
  });

  it('redacts a provider key out of the message', () => {
    const event = log.append({
      level: 'error',
      source: 'provider',
      message: `Incorrect API key provided: ${OPENAI_KEY}`,
    });

    expect(event.message).not.toContain(OPENAI_KEY);
    expect(event.message).toContain('[REDACTED]');
  });

  it('redacts keys nested anywhere in the detail object', () => {
    const event = log.append({
      level: 'error',
      source: 'provider',
      message: 'request failed',
      detail: {
        request: { headers: { authorization: `Bearer ${ANTHROPIC_KEY}` } },
        attempts: [{ note: `retried with ${OPENAI_KEY}` }],
      },
    });

    const serialized = JSON.stringify(event.detail);

    expect(serialized).not.toContain(ANTHROPIC_KEY);
    expect(serialized).not.toContain(OPENAI_KEY);
  });

  it('redacts a key carried on a thrown error and its stack', () => {
    const cause = new Error(`auth failed for ${OPENAI_KEY}`);
    cause.stack = `Error: auth failed for ${OPENAI_KEY}\n    at somewhere`;

    const event = log.error('provider', 'provider call failed', cause);

    expect(JSON.stringify(event)).not.toContain(OPENAI_KEY);
  });

  it('leaves ordinary content untouched', () => {
    const event = log.append({ level: 'info', source: 'build', message: 'built in 1.2s' });

    expect(event.message).toBe('built in 1.2s');
  });

  it('redacts values of any shape without changing structure', () => {
    const redacted = redactValue({ a: [{ b: OPENAI_KEY }], c: 42, d: null }) as {
      a: Array<{ b: string }>;
      c: number;
      d: null;
    };

    expect(redacted.a[0].b).not.toContain(OPENAI_KEY);
    expect(redacted.c).toBe(42);
    expect(redacted.d).toBeNull();
  });
});

describe('pipeline events', () => {
  let log: CudeEventLog;

  beforeEach(() => {
    log = new CudeEventLog();
  });

  it('records newest first', () => {
    log.append({ level: 'info', source: 'pipeline', message: 'first' });
    log.append({ level: 'info', source: 'pipeline', message: 'second' });

    expect(log.events.map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('keeps the pipeline stage and agent that reported an event', () => {
    const event = log.append({
      level: 'info',
      source: 'agent',
      message: 'design contract ready',
      stage: 'design_review',
      agent: 'Design Director',
    });

    expect(event).toMatchObject({ stage: 'design_review', agent: 'Design Director' });
  });

  it('answers what happened during one stage', () => {
    log.append({ level: 'info', source: 'agent', message: 'a', stage: 'building' });
    log.append({ level: 'info', source: 'agent', message: 'b', stage: 'design_review' });
    log.append({ level: 'error', source: 'build', message: 'c', stage: 'building' });

    expect(log.query({ stage: 'building' }).map((e) => e.message)).toEqual(['c', 'a']);
  });

  it('filters by level and by source', () => {
    log.append({ level: 'error', source: 'provider', message: 'p-err' });
    log.append({ level: 'info', source: 'provider', message: 'p-info' });
    log.append({ level: 'error', source: 'build', message: 'b-err' });

    expect(log.query({ level: 'error' }).map((e) => e.message)).toEqual(['b-err', 'p-err']);
    expect(log.query({ source: 'provider' }).map((e) => e.message)).toEqual(['p-info', 'p-err']);
    expect(log.query({ level: ['error'], source: ['build'] }).map((e) => e.message)).toEqual(['b-err']);
  });

  it('searches messages case-insensitively', () => {
    log.append({ level: 'info', source: 'build', message: 'Compiled successfully' });

    expect(log.query({ search: 'compiled' })).toHaveLength(1);
    expect(log.query({ search: 'nope' })).toHaveLength(0);
  });

  it('limits results', () => {
    for (let i = 0; i < 5; i++) {
      log.append({ level: 'info', source: 'system', message: `m${i}` });
    }

    expect(log.query({ limit: 2 })).toHaveLength(2);
  });
});

describe('retention', () => {
  it('discards the oldest events past the cap', () => {
    const log = new CudeEventLog(3);

    for (const message of ['a', 'b', 'c', 'd']) {
      log.append({ level: 'info', source: 'system', message });
    }

    expect(log.events.map((e) => e.message)).toEqual(['d', 'c', 'b']);
  });

  it('does not leak unread ids for discarded events', () => {
    const log = new CudeEventLog(2);

    for (const message of ['a', 'b', 'c']) {
      log.append({ level: 'info', source: 'system', message });
    }

    expect(log.unreadCount).toBe(2);
  });

  it('exposes a sane default cap', () => {
    expect(MAX_EVENTS).toBe(1000);
  });
});

describe('read state and subscription', () => {
  let log: CudeEventLog;

  beforeEach(() => {
    log = new CudeEventLog();
  });

  it('marks new events unread and lets them be read', () => {
    const event = log.append({ level: 'info', source: 'system', message: 'x' });

    expect(log.isUnread(event.id)).toBe(true);

    log.markRead(event.id);

    expect(log.isUnread(event.id)).toBe(false);
    expect(log.unreadCount).toBe(0);
  });

  it('marks everything read at once', () => {
    log.append({ level: 'info', source: 'system', message: 'a' });
    log.append({ level: 'info', source: 'system', message: 'b' });
    log.markAllRead();

    expect(log.unreadCount).toBe(0);
  });

  it('notifies subscribers on append and clear', () => {
    const seen: number[] = [];
    const unsubscribe = log.subscribe((events) => seen.push(events.length));

    log.append({ level: 'info', source: 'system', message: 'a' });
    log.clear();
    unsubscribe();
    log.append({ level: 'info', source: 'system', message: 'b' });

    // initial, after append, after clear — nothing after unsubscribe
    expect(seen).toEqual([0, 1, 0]);
  });

  it('clears everything', () => {
    log.append({ level: 'info', source: 'system', message: 'a' });
    log.clear();

    expect(log.events).toEqual([]);
    expect(log.unreadCount).toBe(0);
  });
});

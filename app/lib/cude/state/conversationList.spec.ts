/**
 * Cude.new - the conversation list.
 *
 * Date boundaries and selection are the two places this can be quietly wrong.
 * A day-boundary error puts yesterday's work under today; a selection that
 * includes hidden rows deletes conversations the person could not see.
 */

import { describe, it, expect } from 'vitest';
import {
  isListable,
  groupFor,
  groupByDate,
  orderConversations,
  searchConversations,
  selectableIds,
  toggleSelection,
  pruneSelection,
  describeDeletion,
  GROUP_ORDER,
} from './conversationList';
import type { Conversation } from '~/lib/cude/persistence/conversationStore';

/*
 * Local time throughout. Grouping answers "was this today?" the way the person
 * looking at the list would, so a fixture written in UTC lands in a different
 * group depending on where the tests run.
 */
const NOW = new Date(2026, 2, 15, 12, 0, 0);

/** A local timestamp `days` before NOW, at `hour`. */
function daysBefore(days: number, hour = 9): string {
  return new Date(2026, 2, 15 - days, hour, 0, 0).toISOString();
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    urlId: 'c1',
    description: 'A build',
    messages: [],
    timestamp: NOW.toISOString(),
    ...overrides,
  } as Conversation;
}

function at(iso: string, id = iso): Conversation {
  return conversation({ id, urlId: id, timestamp: iso });
}

describe('what is worth listing', () => {
  it('lists a conversation with a title and an address', () => {
    expect(isListable(conversation())).toBe(true);
  });

  it('skips one that was never given a title', () => {
    expect(isListable(conversation({ description: undefined }))).toBe(false);
    expect(isListable(conversation({ description: '   ' }))).toBe(false);
  });

  it('skips one with nowhere to navigate to', () => {
    expect(isListable(conversation({ urlId: undefined }))).toBe(false);
  });
});

describe('grouping by date', () => {
  it('puts the same day under Today', () => {
    expect(groupFor(daysBefore(0, 1), NOW)).toBe('Today');
  });

  it('puts the day before under Yesterday', () => {
    expect(groupFor(daysBefore(1), NOW)).toBe('Yesterday');
  });

  it('does not call late yesterday "today" just because it is close', () => {
    // 23:59 yesterday is one calendar day back, not "a few hours ago".
    expect(groupFor(daysBefore(1, 23), NOW)).toBe('Yesterday');
  });

  it('groups the rest of the week together', () => {
    expect(groupFor(daysBefore(5), NOW)).toBe('This week');
  });

  it('groups the rest of the month together', () => {
    expect(groupFor(daysBefore(18), NOW)).toBe('This month');
  });

  it('puts anything older under Earlier', () => {
    expect(groupFor(daysBefore(200), NOW)).toBe('Earlier');
  });

  it('treats an unreadable timestamp as old rather than throwing', () => {
    expect(groupFor('not a date', NOW)).toBe('Earlier');
  });

  it('treats a timestamp from the future as today', () => {
    expect(groupFor(daysBefore(-5), NOW)).toBe('Today');
  });

  it('returns the groups newest first and drops empty ones', () => {
    const groups = groupByDate([at(daysBefore(0)), at(daysBefore(400)), at(daysBefore(1))], NOW);

    expect(groups.map((group) => group.name)).toEqual(['Today', 'Yesterday', 'Earlier']);
  });

  it('keeps every conversation in exactly one group', () => {
    const items = [at(daysBefore(0)), at(daysBefore(1)), at(daysBefore(14))];
    const total = groupByDate(items, NOW).reduce((sum, group) => sum + group.items.length, 0);

    expect(total).toBe(items.length);
  });

  it('names the groups in a fixed order', () => {
    expect(GROUP_ORDER).toEqual(['Today', 'Yesterday', 'This week', 'This month', 'Earlier']);
  });
});

describe('ordering', () => {
  it('puts the newest first', () => {
    const ordered = orderConversations([at(daysBefore(5)), at(daysBefore(0))]);

    expect(ordered[0].id).toBe(daysBefore(0));
  });

  it('leaves out anything not worth listing', () => {
    expect(orderConversations([conversation({ description: '' })])).toHaveLength(0);
  });

  it('does not mutate what it was given', () => {
    const items = [at(daysBefore(5)), at(daysBefore(0))];
    const before = items.map((item) => item.id);

    orderConversations(items);

    expect(items.map((item) => item.id)).toEqual(before);
  });
});

describe('searching', () => {
  const items = [
    conversation({ id: 'a', description: 'Habit tracker for Android' }),
    conversation({ id: 'b', description: 'Invoice dashboard' }),
    conversation({ id: 'c', description: 'ANDROID camera app' }),
  ];

  it('returns everything for an empty query', () => {
    expect(searchConversations(items, '  ')).toHaveLength(3);
  });

  it('matches regardless of case', () => {
    expect(searchConversations(items, 'android').map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('matches every term, in any order', () => {
    expect(searchConversations(items, 'android habit').map((item) => item.id)).toEqual(['a']);
  });

  it('returns nothing when no title matches every term', () => {
    expect(searchConversations(items, 'android invoice')).toHaveLength(0);
  });

  it('copes with a conversation that has no title', () => {
    expect(() => searchConversations([conversation({ description: undefined })], 'x')).not.toThrow();
  });
});

describe('selection', () => {
  const visible = [conversation({ id: 'a' }), conversation({ id: 'b' })];

  it('selects only what is visible', () => {
    expect(selectableIds(visible)).toEqual(['a', 'b']);
  });

  it('adds an id that was not selected', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes one that was', () => {
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('drops a selected conversation the filter has hidden', () => {
    // Otherwise deleting would remove a row the person could not see.
    expect(pruneSelection(['a', 'hidden'], visible)).toEqual(['a']);
  });

  it('keeps an empty selection empty', () => {
    expect(pruneSelection([], visible)).toEqual([]);
  });
});

describe('what the confirmation says', () => {
  it('is singular for one', () => {
    expect(describeDeletion(1)).toMatch(/this conversation/);
  });

  it('names the number for several', () => {
    expect(describeDeletion(4)).toContain('4 conversations');
  });

  it('always says there is no undo', () => {
    expect(describeDeletion(1)).toMatch(/no undo/);
    expect(describeDeletion(9)).toMatch(/no undo/);
  });
});

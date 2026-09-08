/**
 * Cude.new - the conversation list, as data.
 *
 * Everything the sidebar decides before it draws anything: which conversations
 * are worth showing, which match a search, how they group by date, and what a
 * selection means.
 *
 * Kept out of the component because these are the parts that can be wrong in a
 * way nobody notices — a date boundary off by a day, a search that misses a
 * title because of its case, a "select all" that quietly includes rows the
 * filter hid.
 */

import type { Conversation } from '~/lib/cude/persistence/conversationStore';

export type DateGroupName = 'Today' | 'Yesterday' | 'This week' | 'This month' | 'Earlier';

export interface DateGroup {
  name: DateGroupName;
  items: Conversation[];
}

/** Order the groups always appear in, newest first. */
export const GROUP_ORDER: DateGroupName[] = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

/**
 * A conversation is listable once it has a title and somewhere to navigate to.
 *
 * A conversation with neither is one that was started and abandoned before the
 * first exchange; showing it gives the reader a row that does nothing.
 */
export function isListable(conversation: Conversation): boolean {
  return Boolean(conversation.urlId) && Boolean(conversation.description?.trim());
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Which group a timestamp belongs to, relative to `now`. */
export function groupFor(timestamp: string, now: Date = new Date()): DateGroupName {
  const then = new Date(timestamp);

  if (Number.isNaN(then.getTime())) {
    return 'Earlier';
  }

  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  if (days <= 0) {
    return 'Today';
  }

  if (days === 1) {
    return 'Yesterday';
  }

  if (days < 7) {
    return 'This week';
  }

  if (days < 30) {
    return 'This month';
  }

  return 'Earlier';
}

/** Newest first, and only the ones worth listing. */
export function orderConversations(conversations: Conversation[]): Conversation[] {
  return conversations
    .filter(isListable)
    .slice()
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/**
 * Matches every whitespace-separated term against the title.
 *
 * Term-wise rather than as one substring: people remember two words from a
 * title, rarely in the order they were written.
 */
export function searchConversations(conversations: Conversation[], query: string): Conversation[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return conversations;
  }

  return conversations.filter((conversation) => {
    const haystack = (conversation.description ?? '').toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

/** Groups an ordered list by date, dropping the groups that are empty. */
export function groupByDate(conversations: Conversation[], now: Date = new Date()): DateGroup[] {
  const buckets = new Map<DateGroupName, Conversation[]>();

  for (const conversation of conversations) {
    const name = groupFor(conversation.timestamp, now);
    const bucket = buckets.get(name);

    if (bucket) {
      bucket.push(conversation);
    } else {
      buckets.set(name, [conversation]);
    }
  }

  return GROUP_ORDER.filter((name) => buckets.has(name)).map((name) => ({ name, items: buckets.get(name)! }));
}

/**
 * The ids "select all" should choose.
 *
 * Only what is currently visible: selecting rows a search has hidden and then
 * deleting them is the kind of surprise that loses someone's work.
 */
export function selectableIds(visible: Conversation[]): string[] {
  return visible.map((conversation) => conversation.id);
}

/** Adds or removes one id, leaving the rest alone. */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

/** Drops any selected id that is no longer visible. */
export function pruneSelection(selected: readonly string[], visible: Conversation[]): string[] {
  const present = new Set(visible.map((conversation) => conversation.id));

  return selected.filter((id) => present.has(id));
}

/** What to say before deleting, so the number is never a surprise. */
export function describeDeletion(count: number): string {
  if (count === 1) {
    return 'Delete this conversation? Everything built in it goes too, and there is no undo.';
  }

  return `Delete ${count} conversations? Everything built in them goes too, and there is no undo.`;
}

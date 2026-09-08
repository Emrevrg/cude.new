/**
 * Cude.new - conversation store behaviour.
 *
 * None of this was reachable by tests before: the inherited layer opened
 * IndexedDB at module scope with a top-level await, so importing it connected
 * to a database and it could only run in a browser.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryProjectStorage } from './storage';
import { ConversationStore, slugify, conversationKey } from './conversationStore';

function message(id: string, content: string) {
  return { id, role: 'user', content };
}

function newStore() {
  const storage = new MemoryProjectStorage();
  return { storage, store: new ConversationStore(storage) };
}

describe('slugify', () => {
  it('makes a URL-safe slug from a description', () => {
    expect(slugify('Build an Expense Tracker!', 'fallback')).toBe('build-an-expense-tracker');
  });

  it('collapses runs of punctuation', () => {
    expect(slugify('a  --  b', 'fallback')).toBe('a-b');
  });

  it('falls back when nothing usable survives', () => {
    expect(slugify('!!!', '7')).toBe('7');
    expect(slugify('', '7')).toBe('7');
  });

  it('caps the length so a URL stays sane', () => {
    expect(slugify('x'.repeat(200), 'f').length).toBeLessThanOrEqual(60);
  });
});

describe('conversations', () => {
  let store: ConversationStore;
  let storage: MemoryProjectStorage;

  beforeEach(() => {
    ({ store, storage } = newStore());
  });

  it('reports nothing for an unknown conversation', async () => {
    expect(await store.get('nope')).toBeNull();
  });

  it('saves and reloads a conversation', async () => {
    await store.save({ id: '1', messages: [message('m1', 'hello')], description: 'First' });

    const loaded = await store.get('1');

    expect(loaded?.description).toBe('First');
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.timestamp).toBeTruthy();
  });

  it('lists conversations most recent first', async () => {
    await store.save({ id: '1', messages: [], timestamp: '2026-01-01T00:00:00Z' });
    await store.save({ id: '2', messages: [], timestamp: '2026-02-01T00:00:00Z' });

    expect((await store.list()).map((c) => c.id)).toEqual(['2', '1']);
  });

  it('survives one corrupt record when listing', async () => {
    await store.save({ id: '1', messages: [] });
    await storage.set(conversationKey('broken'), 'not json');

    expect((await store.list()).map((c) => c.id)).toEqual(['1']);
  });

  it('appends messages', async () => {
    await store.save({ id: '1', messages: [message('m1', 'a')] });
    await store.appendMessages('1', [message('m2', 'b')]);

    expect((await store.get('1'))?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('reports an append to a conversation that does not exist', async () => {
    expect(await store.appendMessages('nope', [])).toBeNull();
  });

  it('updates a description', async () => {
    await store.save({ id: '1', messages: [] });
    await store.setDescription('1', 'Renamed');

    expect((await store.get('1'))?.description).toBe('Renamed');
  });

  it('deletes one conversation', async () => {
    await store.save({ id: '1', messages: [] });
    await store.delete('1');

    expect(await store.get('1')).toBeNull();
  });

  it('deletes everything and reports how many went', async () => {
    await store.save({ id: '1', messages: [] });
    await store.save({ id: '2', messages: [] });

    expect(await store.deleteAll()).toBe(2);
    expect(await store.list()).toEqual([]);
  });

  it('leaves unrelated storage entries alone', async () => {
    await storage.set('project:x', '{}');
    await store.save({ id: '1', messages: [] });
    await store.deleteAll();

    expect(await storage.get('project:x')).toBe('{}');
  });
});

describe('url ids', () => {
  let store: ConversationStore;

  beforeEach(() => {
    ({ store } = newStore());
  });

  it('finds a conversation by its URL id', async () => {
    await store.save({ id: '1', urlId: 'expense-tracker', messages: [] });

    expect((await store.getByUrlId('expense-tracker'))?.id).toBe('1');
  });

  it('reports nothing for an unknown URL id', async () => {
    expect(await store.getByUrlId('nope')).toBeNull();
  });

  it('suffixes a URL id that is already taken', async () => {
    // Reusing one would silently point two conversations at the same URL.
    await store.save({ id: '1', urlId: 'tracker', messages: [] });

    expect(await store.uniqueUrlId('tracker')).toBe('tracker-2');
  });

  it('keeps suffixing past the first collision', async () => {
    await store.save({ id: '1', urlId: 'tracker', messages: [] });
    await store.save({ id: '2', urlId: 'tracker-2', messages: [] });

    expect(await store.uniqueUrlId('tracker')).toBe('tracker-3');
  });

  it('frees a URL id when its conversation is deleted', async () => {
    await store.save({ id: '1', urlId: 'tracker', messages: [] });
    await store.delete('1');

    expect(await store.uniqueUrlId('tracker')).toBe('tracker');
  });
});

describe('ids and forking', () => {
  let store: ConversationStore;

  beforeEach(() => {
    ({ store } = newStore());
  });

  it('starts numbering at one', async () => {
    expect(await store.nextId()).toBe('1');
  });

  it('continues past the highest existing id', async () => {
    await store.save({ id: '1', messages: [] });
    await store.save({ id: '7', messages: [] });

    expect(await store.nextId()).toBe('8');
  });

  it('forks a conversation with all of its messages', async () => {
    await store.save({ id: '1', description: 'Tracker', messages: [message('m1', 'a'), message('m2', 'b')] });

    const fork = await store.fork('1');

    expect(fork?.id).not.toBe('1');
    expect(fork?.messages).toHaveLength(2);
    expect(fork?.description).toContain('fork');
  });

  it('truncates a fork at the chosen message', async () => {
    await store.save({
      id: '1',
      messages: [message('m1', 'a'), message('m2', 'b'), message('m3', 'c')],
    });

    const fork = await store.fork('1', 'm2');

    expect(fork?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('keeps everything when the cut message is not in the conversation', async () => {
    await store.save({ id: '1', messages: [message('m1', 'a')] });

    expect((await store.fork('1', 'nope'))?.messages).toHaveLength(1);
  });

  it('leaves the original untouched', async () => {
    await store.save({ id: '1', messages: [message('m1', 'a'), message('m2', 'b')] });
    await store.fork('1', 'm1');

    expect((await store.get('1'))?.messages).toHaveLength(2);
  });

  it('reports a fork of a conversation that does not exist', async () => {
    expect(await store.fork('nope')).toBeNull();
  });

  it('gives the fork its own URL id', async () => {
    await store.save({ id: '1', urlId: 'tracker', description: 'Tracker', messages: [] });

    const fork = await store.fork('1');

    expect(fork?.urlId).not.toBe('tracker');
  });
});

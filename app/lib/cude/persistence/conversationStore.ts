/**
 * Cude.new - conversation store.
 *
 * The record of what was said in a project: messages, a description, a stable
 * URL id, and metadata. Distinct from the project store, which holds the
 * product itself — requirements, architecture, design — because a conversation
 * can be forked or deleted without touching the product it produced.
 *
 * Built on the same injected `ProjectStorage` as everything else, so the whole
 * history layer is verifiable in a plain Node process. The inherited layer
 * opened IndexedDB at module scope with a top-level `await`, which meant
 * importing it connected to a database as a side effect and could not be
 * exercised anywhere but a browser.
 */

import type { ProjectStorage } from './types';

export interface ConversationMessage {
  id: string;
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface ConversationMetadata {
  [key: string]: unknown;
}

export interface Conversation {
  id: string;

  /** Human-friendly id used in the URL. Unique across conversations. */
  urlId?: string;
  description?: string;
  messages: ConversationMessage[];

  /** ISO timestamp of the last write. */
  timestamp: string;
  metadata?: ConversationMetadata;
}

const KEY_PREFIX = 'conversation:';
const URL_INDEX_KEY = 'conversation-url-index';

export function conversationKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/**
 * Turn a description into a URL-safe slug.
 *
 * Empty or unusable input falls back to the id, so a conversation always has a
 * usable URL.
 */
export function slugify(description: string, fallback: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || fallback;
}

export class ConversationStore {
  constructor(private readonly _storage: ProjectStorage) {}

  /** Every conversation, most recent first. */
  async list(): Promise<Conversation[]> {
    const keys = (await this._storage.keys()).filter((key) => key.startsWith(KEY_PREFIX));
    const out: Conversation[] = [];

    for (const key of keys) {
      const raw = await this._storage.get(key);

      if (!raw) {
        continue;
      }

      try {
        out.push(JSON.parse(raw) as Conversation);
      } catch {
        // One unreadable record must not make the whole history fail to load.
        continue;
      }
    }

    return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async get(id: string): Promise<Conversation | null> {
    const raw = await this._storage.get(conversationKey(id));

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as Conversation;
    } catch {
      return null;
    }
  }

  /** Find a conversation by its URL id. */
  async getByUrlId(urlId: string): Promise<Conversation | null> {
    const index = await this._readUrlIndex();
    const id = index[urlId];

    return id ? this.get(id) : null;
  }

  /** Create or replace a conversation. */
  async save(conversation: Omit<Conversation, 'timestamp'> & { timestamp?: string }): Promise<Conversation> {
    const record: Conversation = {
      ...conversation,
      timestamp: conversation.timestamp ?? new Date().toISOString(),
    };

    await this._storage.set(conversationKey(record.id), JSON.stringify(record));

    if (record.urlId) {
      const index = await this._readUrlIndex();
      index[record.urlId] = record.id;
      await this._writeUrlIndex(index);
    }

    return record;
  }

  /** Append messages to an existing conversation. */
  async appendMessages(id: string, messages: ConversationMessage[]): Promise<Conversation | null> {
    const existing = await this.get(id);

    if (!existing) {
      return null;
    }

    return this.save({ ...existing, messages: [...existing.messages, ...messages], timestamp: undefined });
  }

  async setDescription(id: string, description: string): Promise<Conversation | null> {
    const existing = await this.get(id);

    if (!existing) {
      return null;
    }

    return this.save({ ...existing, description, timestamp: undefined });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    await this._storage.delete(conversationKey(id));

    if (existing?.urlId) {
      const index = await this._readUrlIndex();
      delete index[existing.urlId];
      await this._writeUrlIndex(index);
    }
  }

  async deleteAll(): Promise<number> {
    const keys = (await this._storage.keys()).filter((key) => key.startsWith(KEY_PREFIX));

    for (const key of keys) {
      await this._storage.delete(key);
    }

    await this._writeUrlIndex({});

    return keys.length;
  }

  /**
   * Copy a conversation, optionally truncated at a message.
   *
   * Used to branch: the copy keeps everything up to and including that message
   * and nothing after it.
   */
  async fork(id: string, upToMessageId?: string): Promise<Conversation | null> {
    const source = await this.get(id);

    if (!source) {
      return null;
    }

    let messages = source.messages;

    if (upToMessageId) {
      const cut = source.messages.findIndex((message) => message.id === upToMessageId);

      if (cut !== -1) {
        messages = source.messages.slice(0, cut + 1);
      }
    }

    const newId = await this.nextId();
    const description = source.description ? `${source.description} (fork)` : undefined;

    return this.save({
      id: newId,
      urlId: await this.uniqueUrlId(description ? slugify(description, newId) : newId),
      description,
      messages,
      metadata: source.metadata,
    });
  }

  /** Next free numeric id. */
  async nextId(): Promise<string> {
    const keys = await this._storage.keys();
    let highest = 0;

    for (const key of keys) {
      if (!key.startsWith(KEY_PREFIX)) {
        continue;
      }

      const value = Number.parseInt(key.slice(KEY_PREFIX.length), 10);

      if (!Number.isNaN(value) && value > highest) {
        highest = value;
      }
    }

    return String(highest + 1);
  }

  /**
   * A URL id nobody else is using.
   *
   * Collisions get a numeric suffix rather than overwriting someone else's
   * conversation.
   */
  async uniqueUrlId(candidate: string): Promise<string> {
    const index = await this._readUrlIndex();

    if (!index[candidate]) {
      return candidate;
    }

    let suffix = 2;

    while (index[`${candidate}-${suffix}`]) {
      suffix += 1;
    }

    return `${candidate}-${suffix}`;
  }

  private async _readUrlIndex(): Promise<Record<string, string>> {
    const raw = await this._storage.get(URL_INDEX_KEY);

    if (!raw) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  private async _writeUrlIndex(index: Record<string, string>): Promise<void> {
    await this._storage.set(URL_INDEX_KEY, JSON.stringify(index));
  }
}

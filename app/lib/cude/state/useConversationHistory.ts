/**
 * Cude.new - conversation history, bound to the route.
 *
 * Loads the conversation named in the URL, keeps it saved as the exchange
 * grows, and supports importing, exporting and duplicating one.
 *
 * The store is created on first use rather than at module scope. The inherited
 * hook opened IndexedDB with a top-level `await` at import time, so merely
 * importing it connected to a database — and on the server it could not resolve
 * at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { atom } from 'nanostores';
import { useLoaderData, useNavigate } from '@remix-run/react';
import type { Message } from 'ai';
import { ConversationStore, slugify, type Conversation } from '~/lib/cude/persistence/conversationStore';
import { createProjectStorage } from '~/lib/cude/persistence/storage';
import { cudeEventLog } from '~/lib/cude/state/eventLog';

/** Id of the conversation currently open. */
export const conversationId = atom<string | undefined>(undefined);

/** Title of the conversation currently open. */
export const conversationDescription = atom<string | undefined>(undefined);

export const conversationMetadata = atom<Record<string, unknown> | undefined>(undefined);

let store: ConversationStore | null = null;

/** The conversation store, created on first use. */
export function getConversationStore(): ConversationStore {
  if (!store) {
    store = new ConversationStore(createProjectStorage());
  }

  return store;
}

/** Test seam. */
export function setConversationStore(next: ConversationStore | null): void {
  store = next;
}

/** A title derived from the first thing the user asked for. */
export function deriveDescription(messages: Message[]): string | undefined {
  const first = messages.find((message) => message.role === 'user');

  if (!first) {
    return undefined;
  }

  const text = typeof first.content === 'string' ? first.content : '';

  /*
   * The protocol header first: every user message opens with [Model:] and
   * [Provider:] lines, and the first non-empty line is that header — which is
   * how the header ended up as the page title, the sidebar entry and the URL.
   * A title names what was asked for, not which model was asked.
   */
  const line =
    text
      .split('\n')
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.length > 0 && !/^\[(Model|Provider):.*\]$/.test(candidate)) ?? '';
  const trimmed = line.slice(0, 80);

  return trimmed || undefined;
}

/** Replace the address bar entry without adding to history. */
function rewriteUrl(id: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.pathname = `/chat/${id}`;
  window.history.replaceState({}, '', url);
}

export interface ImportedConversation {
  description?: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

export function useConversationHistory() {
  const navigate = useNavigate();
  const { id: routeId } = useLoaderData<{ id?: string }>() ?? {};

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState(false);

  /** Set once the conversation exists in storage. */
  const urlIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (!routeId) {
      setReady(true);
      return () => undefined;
    }

    const load = async () => {
      const conversations = getConversationStore();

      try {
        const found = (await conversations.getByUrlId(routeId)) ?? (await conversations.get(routeId));

        if (cancelled) {
          return;
        }

        if (!found) {
          /*
           * A URL naming a conversation that no longer exists should land the
           * user on a fresh one, not on a broken page.
           */
          navigate('/', { replace: true });

          return;
        }

        conversationId.set(found.id);
        conversationDescription.set(found.description);
        conversationMetadata.set(found.metadata);
        urlIdRef.current = found.urlId;
        setInitialMessages(found.messages as unknown as Message[]);
      } catch (error) {
        cudeEventLog.error('persistence', 'Could not load the conversation', error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [routeId, navigate]);

  /** Persist the exchange so far, creating the conversation if needed. */
  const storeMessageHistory = useCallback(async (messages: Message[]) => {
    if (messages.length === 0) {
      return;
    }

    const conversations = getConversationStore();

    try {
      let id = conversationId.get();

      if (!id) {
        id = await conversations.nextId();
        conversationId.set(id);
      }

      const description = conversationDescription.get() ?? deriveDescription(messages);

      if (description && !conversationDescription.get()) {
        conversationDescription.set(description);
      }

      if (!urlIdRef.current) {
        urlIdRef.current = await conversations.uniqueUrlId(slugify(description ?? id, id));
        rewriteUrl(urlIdRef.current);
      }

      await conversations.save({
        id,
        urlId: urlIdRef.current,
        description,
        messages: messages as unknown as Conversation['messages'],
        metadata: conversationMetadata.get(),
      });
    } catch (error) {
      cudeEventLog.error('persistence', 'Could not save the conversation', error);
    }
  }, []);

  /** Create a conversation from imported content and open it. */
  const importChat = useCallback(
    async (description: string, messages: Message[], metadata?: Record<string, unknown>) => {
      const conversations = getConversationStore();

      try {
        const id = await conversations.nextId();
        const urlId = await conversations.uniqueUrlId(slugify(description, id));

        await conversations.save({
          id,
          urlId,
          description,
          messages: messages as unknown as Conversation['messages'],
          metadata,
        });

        navigate(`/chat/${urlId}`);
      } catch (error) {
        cudeEventLog.error('persistence', 'Could not import the conversation', error);
        throw error;
      }
    },
    [navigate],
  );

  /** Hand the user a JSON copy of the current conversation. */
  const exportChat = useCallback(async () => {
    const id = conversationId.get();

    if (!id) {
      return;
    }

    const conversation = await getConversationStore().get(id);

    if (!conversation) {
      return;
    }

    const blob = new Blob([JSON.stringify(conversation, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${conversation.urlId ?? conversation.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  /** Branch the current conversation and open the copy. */
  const duplicateCurrentChat = useCallback(async () => {
    const id = conversationId.get();

    if (!id) {
      return;
    }

    const fork = await getConversationStore().fork(id);

    if (fork) {
      navigate(`/chat/${fork.urlId ?? fork.id}`);
    }
  }, [navigate]);

  return {
    ready: !routeId || ready,
    initialMessages,
    storeMessageHistory,
    importChat,
    exportChat,
    duplicateCurrentChat,
  };
}

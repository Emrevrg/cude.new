/**
 * Cude.new - the side panel.
 *
 * Everything you have built, grouped by when. Opens when the pointer reaches
 * the left edge, closes when it leaves, and covers the page while it is open.
 *
 * The decisions about what to show — which conversations are listable, how they
 * group, what a search matches, what "select all" means — are in
 * `conversationList` and tested there. This is the part that draws and the part
 * that talks to the store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { toast } from 'react-toastify';
import { Search, Trash2, X } from 'lucide-react';
import { cubicEasingFn } from '~/utils/easings';
import { getConversationStore, conversationId } from '~/lib/cude/state/useConversationHistory';
import { cudeEventLog } from '~/lib/cude/state/eventLog';
import type { Conversation } from '~/lib/cude/persistence/conversationStore';
import {
  describeDeletion,
  groupByDate,
  orderConversations,
  pruneSelection,
  searchConversations,
  selectableIds,
  toggleSelection,
} from '~/lib/cude/state/conversationList';
import { HistoryItem } from '~/components/sidebar/HistoryItem';
import { SettingsButton } from '~/components/ui/SettingsButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { CudeSettings } from '~/components/cude/settings/CudeSettings.client';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { useStore } from '@nanostores/react';
import {
  closeSidebar,
  openSidebarTransiently,
  setSidebarEdgeOpen,
  sidebarEdgeOpen,
  sidebarOpen,
  sidebarPinned,
} from '~/lib/cude/state/sidebar';

const PANEL_VARIANTS = {
  closed: { left: '-340px', transition: { duration: 0.2, ease: cubicEasingFn } },
  open: { left: 0, transition: { duration: 0.2, ease: cubicEasingFn } },
} satisfies Variants;

/** How close to the left edge opens the panel, and how far past it closes. */
const EDGE_PX = 20;

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-cude-textTertiary">
      <span className="i-ph:clock h-4 w-4 opacity-80" />
      <span>{now.toLocaleDateString()}</span>
      <span>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  );
}

/*
 * `data-cude-sidebar` is a stable hook for the verification pass. The panel's
 * accessible label is free to change wording; the identifier is not.
 */
export function Sidebar() {
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Shared, so the header button opens the same panel the left edge does.
   * While this was local state, that button had nothing to call.
   */
  const open = useStore(sidebarOpen);
  const pinned = useStore(sidebarPinned);
  const edgeOpen = useStore(sidebarEdgeOpen);
  const setOpen = useCallback((next: boolean) => (next ? openSidebarTransiently() : closeSidebar()), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDeletion, setPendingDeletion] = useState<string[] | null>(null);

  const reload = useCallback(() => {
    getConversationStore()
      .list()
      .then((items) => setConversations(orderConversations(items)))
      .catch((error) => {
        cudeEventLog.error('persistence', 'Could not read the conversation list', error);
        toast.error('Your conversations could not be read.');
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Reload each time the panel opens, so it reflects work done since.
  useEffect(() => {
    if (open) {
      reload();
    }
  }, [open, reload]);

  /*
   * The panel follows the pointer to the left edge. While settings are open it
   * stays put, or moving the pointer over the dialog would close what the user
   * is reading behind it.
   */
  useEffect(() => {
    if (settingsOpen) {
      return undefined;
    }

    const onMove = (event: MouseEvent) => {
      if (edgeOpen && event.pageX < EDGE_PX) {
        openSidebarTransiently();
        return;
      }

      // Opened on purpose: it stays until it is closed on purpose.
      if (pinned) {
        return;
      }

      const bounds = panelRef.current?.getBoundingClientRect();

      if (bounds && event.clientX > bounds.right + EDGE_PX) {
        closeSidebar();
      }
    };

    window.addEventListener('mousemove', onMove);

    return () => window.removeEventListener('mousemove', onMove);
  }, [edgeOpen, settingsOpen, pinned]);

  const visible = useMemo(() => searchConversations(conversations, query), [conversations, query]);
  const groups = useMemo(() => groupByDate(visible), [visible]);

  // A selection may not include a conversation the search has hidden.
  useEffect(() => {
    setSelected((current) => pruneSelection(current, visible));
  }, [visible]);

  const remove = useCallback(
    async (ids: string[]) => {
      const store = getConversationStore();

      try {
        await Promise.all(ids.map((id) => store.delete(id)));

        cudeEventLog.append({
          level: 'info',
          source: 'persistence',
          message: `Deleted ${ids.length} ${ids.length === 1 ? 'conversation' : 'conversations'}`,
        });

        // Leave a conversation that no longer exists.
        if (conversationId.get() && ids.includes(conversationId.get()!)) {
          window.location.pathname = '/';
          return;
        }

        setSelected([]);
        setSelecting(false);
        reload();
      } catch (error) {
        cudeEventLog.error('persistence', 'Could not delete conversations', error);
        toast.error('Those conversations could not be deleted.');
        reload();
      }
    },
    [reload],
  );

  const duplicate = useCallback(
    async (id: string) => {
      await getConversationStore().fork(id);
      reload();
    },
    [reload],
  );

  const exportConversation = useCallback((id?: string) => {
    if (!id) {
      return;
    }

    getConversationStore()
      .get(id)
      .then((conversation) => {
        if (!conversation) {
          return;
        }

        const url = URL.createObjectURL(
          new Blob([JSON.stringify(conversation, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${conversation.urlId ?? conversation.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((error) => cudeEventLog.error('persistence', 'Could not export that conversation', error));
  }, []);

  return (
    <>
      {/*
       * The scrim covers the page while the panel is open, and is unmounted
       * when it is not. Leaving a transparent one in place would make "is the
       * page covered?" unanswerable by looking at the document.
       */}
      {open && <div aria-hidden="true" className="fixed inset-0 z-sidebar-backdrop bg-black/30" />}

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label="Your work"
        data-cude-sidebar=""
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={PANEL_VARIANTS}
        className="fixed top-0 z-sidebar flex h-full w-[340px] flex-col border-r border-cude-borderColor bg-cude-background-depth-1 shadow-xl"
      >
        <div className="flex h-[var(--header-height)] items-center border-b border-cude-borderColor px-4">
          <span className="text-sm font-medium text-cude-textPrimary">Your work</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close the panel"
              title="Close the panel"
              className="rounded-md p-1 text-cude-textTertiary hover:bg-cude-background-depth-2 hover:text-cude-textPrimary"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarEdgeOpen(!edgeOpen)}
              aria-pressed={edgeOpen}
              aria-label={edgeOpen ? 'Disable edge opening' : 'Enable edge opening'}
              title={edgeOpen ? 'Disable edge opening' : 'Enable edge opening'}
              className="rounded-md px-2 py-1 text-[10px] text-cude-textTertiary hover:bg-cude-background-depth-2 hover:text-cude-textPrimary"
            >
              Edge {edgeOpen ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <Clock />

        <div className="flex flex-col gap-2 px-4 pb-3">
          <a
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg bg-cude-button-primary-background px-4 py-2 text-sm font-medium text-cude-button-primary-text transition-colors hover:bg-cude-button-primary-backgroundHover"
          >
            <span className="i-ph:plus-circle h-4 w-4" />
            Start something new
          </a>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cude-textTertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search your conversations"
              className="w-full rounded-lg border border-cude-borderColor bg-cude-background-depth-2 py-1.5 pl-8 pr-3 text-sm text-cude-textPrimary placeholder:text-cude-textTertiary focus:border-cude-borderColorActive focus:outline-none"
            />
          </div>

          {conversations.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelecting((current) => !current);
                  setSelected([]);
                }}
                className="text-[11px] text-cude-textTertiary hover:text-cude-textPrimary"
              >
                {selecting ? 'Done' : 'Select'}
              </button>

              {selecting && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelected(selectableIds(visible))}
                    className="text-[11px] text-cude-textTertiary hover:text-cude-textPrimary"
                  >
                    Select all
                  </button>

                  <button
                    onClick={() => setPendingDeletion(selected)}
                    disabled={selected.length === 0}
                    className="flex items-center gap-1 text-[11px] text-cude-item-contentDanger disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete {selected.length > 0 ? selected.length : ''}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 && (
            <p className="px-1 py-8 text-center text-xs text-cude-textTertiary">
              Nothing here yet. Describe something and Cude will build it.
            </p>
          )}

          {conversations.length > 0 && visible.length === 0 && (
            <p className="px-1 py-8 text-center text-xs text-cude-textTertiary">Nothing matches that.</p>
          )}

          {groups.map((group) => (
            <div key={group.name} className="mb-3">
              <p className="sticky top-0 bg-cude-background-depth-1 px-1 py-1.5 text-[11px] uppercase tracking-wide text-cude-textTertiary">
                {group.name}
              </p>

              {group.items.map((item) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  exportChat={exportConversation}
                  onDuplicate={duplicate}
                  selectionMode={selecting}
                  isSelected={selected.includes(item.id)}
                  onToggleSelection={(id) => setSelected((current) => toggleSelection(current, id))}
                  onDelete={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPendingDeletion([item.id]);
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-cude-borderColor px-4 py-3">
          <SettingsButton
            onClick={() => {
              setSettingsOpen(true);
              setOpen(false);
            }}
          />
          <ThemeSwitch />
        </div>
      </motion.div>

      <DialogRoot open={pendingDeletion !== null}>
        <Dialog onClose={() => setPendingDeletion(null)}>
          <DialogTitle>Delete</DialogTitle>
          <DialogDescription>{describeDeletion(pendingDeletion?.length ?? 0)}</DialogDescription>

          <div className="flex justify-end gap-2 px-5 pb-4">
            <DialogButton type="secondary" onClick={() => setPendingDeletion(null)}>
              Keep them
            </DialogButton>

            <DialogButton
              type="danger"
              onClick={() => {
                const ids = pendingDeletion ?? [];
                setPendingDeletion(null);
                remove(ids);
              }}
            >
              Delete
            </DialogButton>
          </div>
        </Dialog>
      </DialogRoot>

      <CudeSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

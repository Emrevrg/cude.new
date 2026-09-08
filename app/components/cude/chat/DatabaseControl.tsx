/*
 * Cude.new - where the generated app keeps its data.
 *
 * Supabase and Firebase answer the same question, so they are one control with
 * two tabs rather than two buttons sitting next to each other. The trigger says
 * what is actually connected — the service's name when one is, both when both
 * are — because "Database" tells you nothing you did not already know.
 *
 * Colours come from the theme tokens throughout. The old control hard-coded
 * emerald, which belonged to neither theme.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import * as Dialog from '@radix-ui/react-dialog';
import { Database, X } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { supabaseProject } from '~/lib/cude/state/supabaseProject';
import { firebaseProject } from '~/lib/cude/state/firebaseProject';
import { useServiceConnection } from '~/lib/cude/state/useServiceConnection';
import { SupabaseSection } from './SupabaseSection';
import { FirebaseSection } from './FirebaseSection';

type Tab = 'supabase' | 'firebase';

export function DatabaseControl() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('supabase');

  const supabaseReady = useStore(supabaseProject.ready);
  const firebaseReady = useStore(firebaseProject.ready);
  const firebaseState = useStore(firebaseProject.state);
  const { isConnected: supabaseConnected } = useServiceConnection('supabase');

  // The Supabase alert asks for this when a query has nowhere to run.
  useEffect(() => {
    const show = () => {
      setTab('supabase');
      setOpen(true);
    };

    window.addEventListener('open-supabase-connection', show);

    return () => window.removeEventListener('open-supabase-connection', show);
  }, []);

  /** What the button says: the thing that is connected, or the category. */
  const label = useMemo(() => {
    if (supabaseReady && firebaseReady) {
      return 'Supabase + Firebase';
    }

    if (supabaseReady) {
      return 'Supabase';
    }

    if (firebaseReady) {
      return firebaseState.config?.projectId ?? 'Firebase';
    }

    return 'Database';
  }, [supabaseReady, firebaseReady, firebaseState.config]);

  const connected = supabaseReady || firebaseReady;

  const openAt = useCallback((next: Tab) => {
    setTab(next);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => openAt(supabaseReady || !firebaseReady ? 'supabase' : 'firebase')}
        title={connected ? `Data: ${label}` : 'Choose where this app keeps its data'}
        className={classNames(
          'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors',
          connected
            ? 'text-cude-textPrimary hover:bg-cude-background-depth-3'
            : 'text-cude-textTertiary hover:text-cude-textPrimary hover:bg-cude-background-depth-3',
        )}
      >
        <Database className="h-3.5 w-3.5" />
        <span className="max-w-[140px] truncate">{label}</span>
        {connected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cude-borderColorActive" />}
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />

          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10000] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-cude-textPrimary">Database</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[11px] text-cude-textTertiary">
                  Where the app Cude builds keeps its data. You can set up both.
                </Dialog.Description>
              </div>

              <Dialog.Close
                aria-label="Close"
                className="shrink-0 rounded-lg p-1 text-cude-textTertiary transition-colors hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="mt-4 flex w-fit gap-1 rounded-lg bg-cude-background-depth-3 p-1">
              {(
                [
                  { id: 'supabase' as const, label: 'Supabase', on: supabaseReady || supabaseConnected },
                  { id: 'firebase' as const, label: 'Firebase', on: firebaseReady },
                ] satisfies { id: Tab; label: string; on: boolean }[]
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={classNames(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                    tab === entry.id
                      ? 'bg-cude-background-depth-1 text-cude-textPrimary shadow-sm'
                      : 'text-cude-textSecondary hover:text-cude-textPrimary',
                  )}
                >
                  {entry.label}
                  {/* A dot rather than a word: the tab is narrow, and "connected" is a state, not a label. */}
                  {entry.on && <span className="h-1.5 w-1.5 rounded-full bg-cude-borderColorActive" />}
                </button>
              ))}
            </div>

            <div className="mt-4">{tab === 'supabase' ? <SupabaseSection active={open} /> : <FirebaseSection />}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

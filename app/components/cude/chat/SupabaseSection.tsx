/*
 * Cude.new - Supabase, as a section of the database surface.
 *
 * Connect the account, then pick the project the generated app will talk to.
 * Both are the domain's job; this renders its state and calls it.
 *
 * Was a dialog of its own. Supabase and Firebase answer the same question —
 * where does this app keep its data — so they belong in one place, and a
 * person should not have to know which of two buttons to press before knowing
 * which service they want.
 */
import { useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { Check, Loader2 } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { supabaseProject } from '~/lib/cude/state/supabaseProject';
import { serviceResources } from '~/lib/cude/state/serviceResources';
import { useServiceConnection, useServiceResources } from '~/lib/cude/state/useServiceConnection';
import { ConnectionSurface } from '~/components/cude/settings/ConnectionSurface';

export function SupabaseSection({ active }: { active: boolean }) {
  const { isConnected } = useServiceConnection('supabase');
  const { items, loading } = useServiceResources('supabase');
  const state = useStore(supabaseProject.state);
  const ready = useStore(supabaseProject.ready);

  useEffect(() => {
    if (active && isConnected) {
      serviceResources.loadOnce('supabase');
    }
  }, [active, isConnected]);

  const choose = useCallback(async (projectId: string) => {
    await supabaseProject.select(projectId);
  }, []);

  return (
    <div>
      <ConnectionSurface service="supabase" />

      {isConnected && (
        <div className="mt-5 border-t border-cude-borderColor pt-4">
          <h4 className="text-sm font-medium text-cude-textPrimary">Project for this build</h4>

          <p className="mt-1 text-[11px] text-cude-textTertiary">
            The app Cude builds will use this project&apos;s URL and anonymous key.
          </p>

          {state.error && <p className="mt-2 text-sm text-cude-item-contentDanger">{state.error}</p>}

          {loading && items.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-cude-textTertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects
            </div>
          )}

          <ul className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {items.map((item) => {
              const selected = item.id === state.projectId;

              return (
                <li key={item.id}>
                  <button
                    onClick={() => choose(item.id)}
                    disabled={state.loading}
                    className={classNames(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50',
                      selected
                        ? 'border-cude-borderColorActive bg-cude-item-backgroundAccent'
                        : 'border-cude-borderColor hover:bg-cude-background-depth-2',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-cude-textPrimary">{item.name}</span>
                      {item.detail && <span className="block text-[11px] text-cude-textTertiary">{item.detail}</span>}
                    </span>

                    {selected && ready && <Check className="h-4 w-4 shrink-0 text-cude-textPrimary" />}
                    {selected && state.loading && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cude-textTertiary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

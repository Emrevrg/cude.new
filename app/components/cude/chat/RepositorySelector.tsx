/**
 * Cude.new - choosing a repository to clone.
 *
 * GitHub and GitLab both answer the same question — which of your repositories
 * do you want — so this asks it once. The two components it replaces were
 * separate implementations of the same list, search box and clone button.
 *
 * The clone URL is derived from the repository's web URL rather than stored,
 * because both services publish the same `<web-url>.git` form and a second
 * field is a second thing to get out of sync.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { serviceResources, RESOURCE_LABEL } from '~/lib/cude/state/serviceResources';
import { useServiceConnection, useServiceResources } from '~/lib/cude/state/useServiceConnection';
import { describeService } from '~/lib/cude/state/serviceDescriptors';

export type RepositoryService = 'github' | 'gitlab';

export interface RepositorySelectorProps {
  service: RepositoryService;
  onClone?: (repoUrl: string, branch?: string) => void;
  className?: string;
}

/** Both services serve a repository over git at its web URL plus `.git`. */
export function cloneUrlFor(webUrl: string): string {
  return webUrl.endsWith('.git') ? webUrl : `${webUrl}.git`;
}

export function RepositorySelector({ service, onClone, className }: RepositorySelectorProps) {
  const { isConnected } = useServiceConnection(service);
  const { items, loading, error, refresh } = useServiceResources(service);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isConnected) {
      serviceResources.loadOnce(service);
    }
  }, [service, isConnected]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [items, query]);

  if (!isConnected) {
    return (
      <div className={classNames('py-8 text-center', className)}>
        <p className="text-sm text-cude-textSecondary">
          Connect {describeService(service)?.label} in settings to browse your repositories.
        </p>
      </div>
    );
  }

  return (
    <div className={classNames('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cude-textTertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${RESOURCE_LABEL[service].toLowerCase()}`}
            aria-label={`Search ${RESOURCE_LABEL[service].toLowerCase()}`}
            className="w-full rounded-lg border border-cude-borderColor bg-cude-background-depth-2 py-2 pl-9 pr-3 text-sm text-cude-textPrimary placeholder:text-cude-textTertiary focus:border-cude-borderColorActive focus:outline-none"
          />
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
          className="rounded-lg border border-cude-borderColor p-2 text-cude-textSecondary hover:text-cude-textPrimary disabled:opacity-50"
        >
          <RefreshCw className={classNames('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {error && <p className="text-sm text-cude-item-contentDanger">{error}</p>}

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-cude-textTertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your {RESOURCE_LABEL[service].toLowerCase()}
        </div>
      )}

      {!loading && matches.length === 0 && (
        <p className="py-8 text-center text-sm text-cude-textTertiary">
          {query ? 'Nothing matches that search.' : 'No repositories here yet.'}
        </p>
      )}

      <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {matches.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-cude-textPrimary">{item.name}</p>
              <p className="text-[11px] text-cude-textTertiary">
                {[item.detail, item.updatedAt && `updated ${new Date(item.updatedAt).toLocaleDateString()}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <button
              onClick={() => item.url && onClone?.(cloneUrlFor(item.url))}
              disabled={!item.url}
              className="shrink-0 rounded-lg bg-cude-button-primary-background px-3 py-1.5 text-xs font-medium text-cude-button-primary-text hover:bg-cude-button-primary-backgroundHover disabled:opacity-50"
            >
              Clone
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

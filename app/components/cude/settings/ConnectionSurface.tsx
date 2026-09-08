/**
 * Cude.new - connecting an external service.
 *
 * One surface for every service. The inherited build had five tabs totalling
 * around four thousand lines that each re-implemented the same three states:
 * not connected, connecting, connected. They had drifted — different error
 * handling, different persistence, different amounts of it working.
 *
 * What differs between services is data, not code: the label, the icon, where
 * you get a token, and whether it can be self-hosted. That lives in the
 * descriptors.
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { describeService } from '~/lib/cude/state/serviceDescriptors';
import { serviceResources, RESOURCE_LABEL } from '~/lib/cude/state/serviceResources';
import { useServiceConnection, useServiceResources } from '~/lib/cude/state/useServiceConnection';
import type { ServiceId } from '~/lib/cude/state/serviceConnections';
import { SURFACE_ICONS } from './surfaceIcons';

const FIELD =
  'w-full rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2 text-sm text-cude-textPrimary placeholder:text-cude-textTertiary focus:outline-none focus:border-cude-borderColorActive';

const BUTTON =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'connected'
      ? 'text-cude-icon-success border-cude-borderColorActive/30 bg-cude-item-backgroundAccent'
      : status === 'error'
        ? 'text-cude-item-contentDanger border-red-500/30 bg-cude-item-contentDanger/5'
        : 'text-cude-textTertiary border-cude-borderColor';

  return <span className={classNames('rounded-full border px-2 py-0.5 text-[11px] capitalize', tone)}>{status}</span>;
}

function ResourceList({ service }: { service: ServiceId }) {
  const { items, loading, error, fetchedAt, refresh } = useServiceResources(service);

  useEffect(() => {
    serviceResources.loadOnce(service);
  }, [service]);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-cude-textPrimary">{RESOURCE_LABEL[service]}</h4>

        <button
          onClick={refresh}
          disabled={loading}
          className={classNames(
            BUTTON,
            'border border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary',
          )}
        >
          <RefreshCw className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-cude-item-contentDanger">{error}</p>}

      {!error && !loading && items.length === 0 && fetchedAt && (
        <p className="mt-2 text-sm text-cude-textTertiary">Nothing here yet.</p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {items.slice(0, 30).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-cude-textPrimary">{item.name}</p>

              <p className="text-[11px] text-cude-textTertiary">
                {[item.detail, item.updatedAt && new Date(item.updatedAt).toLocaleDateString()]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-cude-textSecondary hover:text-cude-textPrimary"
                aria-label={`Open ${item.name}`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </li>
        ))}
      </ul>

      {items.length > 30 && (
        <p className="mt-2 text-[11px] text-cude-textTertiary">
          Showing 30 of {items.length}. Open the service to see the rest.
        </p>
      )}
    </div>
  );
}

export interface ConnectionSurfaceProps {
  service: ServiceId;

  /*
   * The settings panel already names the service in its own header. Anywhere
   * else — a dialog opened mid-task — the surface has to say what it is.
   */
  showTitle?: boolean;
}

export function ConnectionSurface({ service, showTitle = true }: ConnectionSurfaceProps) {
  const descriptor = describeService(service);
  const { connection, state, isConnected, isBusy, connect, disconnect } = useServiceConnection(service);

  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (await connect(token, baseUrl.trim() || undefined)) {
        // Only clear on success, so a mistyped token can be corrected in place.
        setToken('');
        serviceResources.load(service);
      }
    },
    [connect, token, baseUrl, service],
  );

  if (!descriptor) {
    return <p className="text-sm text-cude-textTertiary">Unknown service.</p>;
  }

  const Icon = SURFACE_ICONS[service];
  const account = connection?.account;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        {showTitle && (
          <>
            <Icon className="h-5 w-5 text-cude-textSecondary" />
            <h3 className="text-base font-medium text-cude-textPrimary">{descriptor.label}</h3>
          </>
        )}

        <StatusPill status={state.status} />
      </div>

      {state.error && <p className="mt-3 text-sm text-cude-item-contentDanger">{state.error}</p>}

      {isConnected && account ? (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-3">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cude-background-depth-3 text-sm text-cude-textSecondary">
                {(account.name ?? account.login ?? '?').charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cude-textPrimary">{account.name ?? account.login}</p>
              <p className="truncate text-[11px] text-cude-textTertiary">
                {account.email ?? account.login ?? descriptor.label}
                {connection?.baseUrl ? ` · ${connection.baseUrl}` : ''}
              </p>
            </div>

            <button
              onClick={disconnect}
              className={classNames(
                BUTTON,
                'border border-cude-borderColor text-cude-textSecondary hover:text-cude-item-contentDanger',
              )}
            >
              Disconnect
            </button>
          </div>

          <ResourceList service={service} />
        </>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          {descriptor.selfHostable && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-cude-textSecondary">Instance URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://gitlab.com"
                className={FIELD}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-cude-textSecondary">Access token</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your token"
              className={FIELD}
            />
          </label>

          <p className="text-[11px] text-cude-textTertiary">
            {descriptor.tokenHint} The token is kept in this browser and is never written to the event log.
            {descriptor.tokenUrl && (
              <>
                {' '}
                <a
                  href={descriptor.tokenUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-cude-textSecondary underline hover:text-cude-textPrimary"
                >
                  Create one
                </a>
                .
              </>
            )}
          </p>

          <div>
            <button
              type="submit"
              disabled={isBusy || !token.trim()}
              className={classNames(
                BUTTON,
                'bg-cude-button-primary-background text-cude-button-primary-text hover:bg-cude-button-primary-backgroundHover',
              )}
            >
              {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isBusy ? 'Connecting' : 'Connect'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

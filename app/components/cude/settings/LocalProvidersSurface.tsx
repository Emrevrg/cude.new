/**
 * Cude.new - models running on this machine.
 *
 * For each local server: is it on, where does it live, is it answering, and
 * what does it hold. When it is not answering, the setup steps are right there
 * rather than in a separate guide — the moment you need them is the moment it
 * failed.
 *
 * Replaces ten files that between them polled with a bespoke event emitter,
 * wrapped that in a hook, and kept a six-hundred-line install guide behind its
 * own screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { providers as providerSettings } from '~/lib/cude/state/settings';
import {
  LOCAL_PROVIDER_DESCRIPTORS,
  formatSize,
  localProviders,
  normalizeBaseUrl,
  type LocalProviderDescriptor,
  type Reachability,
} from '~/lib/cude/state/localProviders';

function StatusLine({ state }: { state: Reachability }) {
  if (state === 'checking') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-cude-textTertiary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </span>
    );
  }

  if (state === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-cude-icon-success">
        <CheckCircle2 className="h-3 w-3" />
        Running
      </span>
    );
  }

  if (state === 'unreachable') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-cude-item-contentDanger">
        <XCircle className="h-3 w-3" />
        Not answering
      </span>
    );
  }

  return <span className="text-[11px] text-cude-textTertiary">Off</span>;
}

function ProviderRow({ descriptor }: { descriptor: LocalProviderDescriptor }) {
  const configured = useStore(providerSettings.store);
  const states = useStore(localProviders.states);

  const config = configured[descriptor.id];
  const enabled = Boolean(config?.enabled);
  const state = states[descriptor.id] ?? { reachability: 'unknown' as const, models: [] };

  const [url, setUrl] = useState(config?.baseUrl ?? descriptor.defaultBaseUrl);

  // Watch while the provider is on; stop the moment it is switched off.
  useEffect(() => {
    if (enabled) {
      localProviders.watch(descriptor.id, url);
    } else {
      localProviders.unwatch(descriptor.id);
    }

    return () => localProviders.unwatch(descriptor.id);
  }, [descriptor.id, enabled, url]);

  const commitUrl = useCallback(() => {
    const next = normalizeBaseUrl(url) || descriptor.defaultBaseUrl;
    setUrl(next);
    providerSettings.update(descriptor.id, { baseUrl: next });
  }, [url, descriptor]);

  return (
    <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-cude-textPrimary">{descriptor.label}</h4>
            {enabled && <StatusLine state={state.reachability} />}
          </div>

          <p className="mt-0.5 text-[11px] text-cude-textTertiary">
            {descriptor.summary}
            {state.version && ` · v${state.version}`}
          </p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] text-cude-textSecondary">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={`Use ${descriptor.label}`}
            onChange={(event) => providerSettings.setEnabled(descriptor.id, event.target.checked)}
            className="h-4 w-4 accent-cude-textPrimary"
          />
          Use it
        </label>
      </div>

      {enabled && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={commitUrl}
              onKeyDown={(event) => event.key === 'Enter' && commitUrl()}
              aria-label={`${descriptor.label} address`}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-cude-borderColor bg-cude-background-depth-1 px-2.5 py-1.5 font-mono text-xs text-cude-textPrimary focus:border-cude-borderColorActive focus:outline-none"
            />

            <button
              onClick={() => localProviders.check(descriptor.id, url)}
              disabled={state.reachability === 'checking'}
              aria-label={`Check ${descriptor.label}`}
              className="rounded-lg border border-cude-borderColor p-1.5 text-cude-textSecondary hover:text-cude-textPrimary disabled:opacity-50"
            >
              <RefreshCw className={classNames('h-3.5 w-3.5', state.reachability === 'checking' && 'animate-spin')} />
            </button>
          </div>

          {state.reachability === 'running' && (
            <div className="mt-3">
              <p className="text-[11px] text-cude-textTertiary">
                {state.models.length === 0
                  ? 'Running, but no models are loaded yet.'
                  : `${state.models.length} ${state.models.length === 1 ? 'model' : 'models'} available`}
              </p>

              {state.models.length > 0 && (
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {state.models.map((model) => (
                    <li
                      key={model.name}
                      className="flex items-center justify-between gap-3 rounded px-2 py-1 text-xs text-cude-textSecondary"
                    >
                      <span className="truncate font-mono">{model.name}</span>
                      {formatSize(model.size) && (
                        <span className="shrink-0 text-[11px] text-cude-textTertiary">{formatSize(model.size)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {state.reachability === 'unreachable' && (
            <div className="mt-3 rounded-lg border border-cude-borderColor bg-cude-background-depth-1 p-3">
              <p className="text-[11px] text-cude-textSecondary">
                Nothing answered at that address{state.error ? ` (${state.error})` : ''}.
              </p>

              <ol className="mt-2 flex list-inside list-decimal flex-col gap-1 text-[11px] text-cude-textTertiary">
                {descriptor.setup.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              {descriptor.homepage && (
                <a
                  href={descriptor.homepage}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-cude-textSecondary underline hover:text-cude-textPrimary"
                >
                  {descriptor.homepage.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LocalProvidersSurface() {
  // Stop every watch when the surface goes away, not when a row unmounts.
  useEffect(() => () => localProviders.dispose(), []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-cude-textTertiary">
        Models running on this machine. Nothing leaves it, and no API key is involved — but the server has to be running
        before Cude can use it.
      </p>

      <div className="flex flex-col gap-3">
        {LOCAL_PROVIDER_DESCRIPTORS.map((descriptor) => (
          <ProviderRow key={descriptor.id} descriptor={descriptor} />
        ))}
      </div>
    </div>
  );
}

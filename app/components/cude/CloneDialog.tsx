/*
 * Cude.new - CloneDialog.tsx (Cude product surface, 2026)
 *
 * Pointing at a reference. Three tabs, because a person points at one of
 * three things: a page on the web, an app on their machine, an extension in
 * their browser. The two machine-backed lists come from /api/local-programs,
 * fetched once, the first time the dialog is opened.
 *
 * Two modes share the dialog. Clone recreates the function and the shape;
 * Get Inspired keeps the feel with a new expression. Both can send a second
 * model — the explorer — to map the reference first.
 */
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import type { CloneReference, CloneTarget } from '~/lib/cude/clone';
import { buildCloneMessage, extensionIdFromUrl, isUrl } from '~/lib/cude/clone';
import type { ExplorerSelection, ExploreMode, OsChrome } from '~/lib/cude/explore';
import { OS_CHROME_PRESETS, buildExploreMessage } from '~/lib/cude/explore';
import { ReferenceExplorer } from './ReferenceExplorer';
import type { LocalDiscovery, LocalExtension, LocalProgram } from '~/lib/cude/localPrograms';

interface Props {
  open: boolean;
  onClose: () => void;
  onClone: (message: string, title: string) => void;

  /** Clone recreates function and shape; inspire keeps the feel with a new expression. */
  mode?: ExploreMode;
}

const TABS: { id: CloneTarget; label: string; icon: string }[] = [
  { id: 'web', label: 'Web page', icon: 'i-ph:globe' },
  { id: 'desktop', label: 'Desktop app', icon: 'i-ph:monitor' },
  { id: 'extension', label: 'Extension', icon: 'i-ph:puzzle-piece' },
];

const EMPTY_DISCOVERY: LocalDiscovery = { available: false, programs: [], extensions: [] };

/** How long to wait for a reference page before cloning without it. */
const READ_BUDGET_MS = 3500;

/**
 * Filters a list against what the person typed.
 *
 * A machine can have several hundred Start Menu entries and a few dozen
 * extensions, so this runs on every keystroke — hence the deferred value at
 * the call site rather than a debounce here.
 */
function matches(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) {
    return true;
  }

  const needle = query.toLowerCase();

  return fields.some((field) => field?.toLowerCase().includes(needle));
}

const ProgramRow = memo(
  ({ program, selected, onSelect }: { program: LocalProgram; selected: boolean; onSelect: () => void }) => (
    <button
      type="button"
      onClick={onSelect}
      className={classNames(
        'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2',
        selected
          ? 'bg-cude-item-backgroundAccent text-cude-item-contentAccent'
          : 'text-cude-textPrimary hover:bg-cude-background-depth-3',
      )}
    >
      <div className="i-ph:app-window text-base shrink-0 opacity-60" />
      <span className="truncate flex-1">{program.name}</span>
      <span className="text-xs text-cude-textTertiary shrink-0">{program.source}</span>
    </button>
  ),
);
ProgramRow.displayName = 'ProgramRow';

const ExtensionRow = memo(
  ({ extension, selected, onSelect }: { extension: LocalExtension; selected: boolean; onSelect: () => void }) => (
    <button
      type="button"
      onClick={onSelect}
      className={classNames(
        'w-full text-left px-3 py-2 rounded-lg transition-colors',
        selected
          ? 'bg-cude-item-backgroundAccent text-cude-item-contentAccent'
          : 'text-cude-textPrimary hover:bg-cude-background-depth-3',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="i-ph:puzzle-piece text-base shrink-0 opacity-60" />
        <span className="truncate flex-1">{extension.name}</span>
        <span className="text-xs text-cude-textTertiary shrink-0">{extension.profile}</span>
      </div>
      {extension.description && (
        <p className="text-xs text-cude-textTertiary mt-0.5 pl-6 line-clamp-1">{extension.description}</p>
      )}
    </button>
  ),
);
ExtensionRow.displayName = 'ExtensionRow';

export function CloneDialog({ open, onClose, onClone, mode = 'clone' }: Props) {
  const [target, setTarget] = useState<CloneTarget>('web');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState('');
  const [picked, setPicked] = useState<CloneReference | null>(null);
  const [discovery, setDiscovery] = useState<LocalDiscovery>(EMPTY_DISCOVERY);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uiMap, setUiMap] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<ExplorerSelection | null>(null);
  const [excerpt, setExcerpt] = useState<string | undefined>(undefined);
  const [osChrome, setOsChrome] = useState<OsChrome>('windows');
  const requested = useRef(false);

  // Long lists, and a filter on every keystroke: let typing stay ahead of it.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open || requested.current) {
      return;
    }

    requested.current = true;
    setLoading(true);

    fetch('/api/local-programs')
      .then((response) => (response.ok ? response.json() : EMPTY_DISCOVERY))
      .then((result) => setDiscovery(result as LocalDiscovery))
      .catch(() => setDiscovery(EMPTY_DISCOVERY))
      .finally(() => setLoading(false));
  }, [open]);

  const programs = useMemo(
    () => discovery.programs.filter((program) => matches(deferredQuery, program.name)).slice(0, 200),
    [discovery.programs, deferredQuery],
  );

  const extensions = useMemo(
    () =>
      discovery.extensions
        .filter((extension) => matches(deferredQuery, extension.name, extension.description, extension.profile))
        .slice(0, 200),
    [discovery.extensions, deferredQuery],
  );

  const reset = useCallback(() => {
    setQuery('');
    setDetail('');
    setPicked(null);
    setUiMap(null);
    setExcerpt(undefined);
  }, []);

  const switchTab = useCallback((next: CloneTarget) => {
    setTarget(next);
    setQuery('');
    setPicked(null);
    setUiMap(null);
    setExcerpt(undefined);
  }, []);

  /**
   * What will actually be cloned.
   *
   * A row that was clicked wins; otherwise whatever is typed becomes the
   * reference, so someone who knows what they want never has to hunt a list.
   */
  const reference = useMemo((): CloneReference | null => {
    if (picked) {
      return picked;
    }

    const typed = query.trim();

    if (typed.length < 2) {
      return null;
    }

    if (isUrl(typed)) {
      const extensionId = extensionIdFromUrl(typed);

      return {
        name: typed,
        url: typed,
        origin: extensionId ? 'store' : 'url',
        facts: extensionId ? { 'Extension id': extensionId } : undefined,
      };
    }

    return { name: typed, origin: 'typed' };
  }, [picked, query]);

  const handleClone = useCallback(async () => {
    if (!reference || busy) {
      return;
    }

    setBusy(true);

    /*
     * The excerpt may already be here: it is fetched while the dialog is open
     * so the explorer maps from the page, not just the name. A slow site is
     * still not worth a frozen button — the URL is in the prompt either way.
     */
    let text = excerpt;

    if (reference.url && text === undefined) {
      const giveUp = AbortSignal.timeout(READ_BUDGET_MS);

      try {
        const response = await fetch(`/api/fetch-reference?url=${encodeURIComponent(reference.url)}`, {
          signal: giveUp,
        });
        const body = (await response.json()) as { ok?: boolean; text?: string };

        if (body.ok && body.text) {
          text = body.text.slice(0, 8000);
        }
      } catch {
        // Too slow, offline, or refused. The name and the URL carry the request.
      }
    }

    /*
     * A drawn map plus the brain that drew it beats a bare name. Without a
     * map, a clone is exactly what this dialog always sent; an inspiration
     * without a map still carries the mode contract.
     */
    const message =
      uiMap && explorer
        ? buildExploreMessage(
            { mode, target, reference, detail: detail.trim() || undefined, excerpt: text, explorer, osChrome },
            uiMap,
          )
        : mode === 'inspire'
          ? buildExploreMessage(
              {
                mode,
                target,
                reference,
                detail: detail.trim() || undefined,
                excerpt: text,
                explorer: explorer ?? undefined,
                osChrome,
              },
              null,
            )
          : buildCloneMessage({ target, reference, detail: detail.trim() || undefined }, text);

    onClone(message, `${mode === 'inspire' ? 'Inspired' : 'Clone'}: ${reference.name.slice(0, 48)}`);
    setBusy(false);
    reset();
    onClose();
  }, [reference, busy, target, detail, onClone, onClose, reset, uiMap, explorer, excerpt, osChrome]);

  const placeholder =
    target === 'web'
      ? 'Paste a URL, or name a site — "linear.app", "the Stripe dashboard"'
      : target === 'desktop'
        ? 'Search your installed apps, or just type a name — "Claude"'
        : 'Search your extensions, or paste a store link';

  /*
   * The explorer maps from the page, not just the name — so the read starts
   * while the dialog is open instead of when the button is pressed.
   */
  const referenceUrl = reference?.url;

  useEffect(() => {
    if (!referenceUrl) {
      setExcerpt(undefined);
      return undefined;
    }

    let cancelled = false;
    setExcerpt(undefined);

    const giveUp = AbortSignal.timeout(READ_BUDGET_MS);

    fetch(`/api/fetch-reference?url=${encodeURIComponent(referenceUrl)}`, { signal: giveUp })
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && (body as { ok?: boolean; text?: string }).ok && (body as { text?: string }).text) {
          setExcerpt((body as { text: string }).text.slice(0, 8000));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [referenceUrl]);

  const list = target === 'desktop' ? programs : target === 'extension' ? extensions : [];
  const showList = target !== 'web';

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      {open && (
        <Dialog className="max-w-2xl w-full p-6" onClose={onClose}>
          <DialogTitle>{mode === 'inspire' ? 'Get Inspired' : 'Clone a program'}</DialogTitle>
          <DialogDescription className="mt-1">
            {mode === 'inspire'
              ? 'Point at something good. Cude studies how it feels, then designs something new in that spirit — never a copy.'
              : 'Point at something you already use. Cude builds an original implementation that works like it.'}
          </DialogDescription>

          <div className="mt-4 flex gap-1 p-1 rounded-lg bg-cude-background-depth-3 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={classNames(
                  'px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5',
                  target === tab.id
                    ? 'bg-cude-background-depth-1 text-cude-textPrimary shadow-sm'
                    : 'text-cude-textSecondary hover:text-cude-textPrimary',
                )}
              >
                <div className={classNames(tab.icon, 'text-base')} />
                {tab.label}
              </button>
            ))}
          </div>

          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPicked(null);
            }}
            placeholder={placeholder}
            className={classNames(
              'mt-4 w-full px-3 py-2 rounded-lg text-sm',
              'bg-cude-background-depth-2 text-cude-textPrimary placeholder:text-cude-textTertiary',
              'border border-cude-borderColor focus:outline-none focus:ring-1 focus:ring-cude-item-contentAccent',
            )}
          />

          {showList && (
            <div className="mt-3 h-56 overflow-y-auto rounded-lg border border-cude-borderColor p-1">
              {loading && (
                <div className="flex items-center gap-2 p-3 text-sm text-cude-textTertiary">
                  <div className="i-svg-spinners:90-ring-with-bg text-base" />
                  Reading what is installed…
                </div>
              )}

              {!loading && !discovery.available && (
                <p className="p-3 text-sm text-cude-textTertiary">
                  {discovery.reason ?? 'Nothing could be read from this machine.'} You can still type a name above.
                </p>
              )}

              {!loading && discovery.available && list.length === 0 && (
                <p className="p-3 text-sm text-cude-textTertiary">
                  {target === 'extension'
                    ? 'No extension matches. Paste a store link above instead.'
                    : 'No app matches. Type the name above instead.'}
                </p>
              )}

              {!loading &&
                list.map((entry) =>
                  target === 'desktop' ? (
                    <ProgramRow
                      key={`${(entry as LocalProgram).name}-${(entry as LocalProgram).source}`}
                      program={entry as LocalProgram}
                      selected={picked?.name === (entry as LocalProgram).name}
                      onSelect={() => {
                        const program = entry as LocalProgram;

                        setPicked({
                          name: program.name,
                          origin: 'installed',
                          facts: { Found: program.source },
                        });
                      }}
                    />
                  ) : (
                    <ExtensionRow
                      key={(entry as LocalExtension).id}
                      extension={entry as LocalExtension}
                      selected={picked?.facts?.['Extension id'] === (entry as LocalExtension).id}
                      onSelect={() => {
                        const extension = entry as LocalExtension;

                        setPicked({
                          name: extension.name,
                          url: extension.storeUrl,
                          origin: 'installed',
                          facts: {
                            'Extension id': extension.id,
                            Browser: extension.browser,
                            Version: extension.version ?? '',
                            What: extension.description ?? '',
                          },
                        });
                      }}
                    />
                  ),
                )}
            </div>
          )}

          <input
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder={'Anything to change? — "make it dark", "no sign-in"'}
            className={classNames(
              'mt-3 w-full px-3 py-2 rounded-lg text-sm',
              'bg-cude-background-depth-2 text-cude-textPrimary placeholder:text-cude-textTertiary',
              'border border-cude-borderColor focus:outline-none focus:ring-1 focus:ring-cude-item-contentAccent',
            )}
          />

          {target === 'desktop' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-cude-textSecondary">Window chrome:</span>
              {(Object.keys(OS_CHROME_PRESETS) as OsChrome[]).map((os) => (
                <button
                  key={os}
                  type="button"
                  onClick={() => setOsChrome(os)}
                  className={classNames(
                    'px-2.5 py-1 text-xs rounded-md transition-colors',
                    osChrome === os
                      ? 'bg-cude-background-depth-1 text-cude-textPrimary shadow-sm border border-cude-borderColor'
                      : 'text-cude-textSecondary hover:text-cude-textPrimary',
                  )}
                >
                  {OS_CHROME_PRESETS[os].label}
                </button>
              ))}
              <span className="w-full text-xs text-cude-textTertiary">
                Tip: attach a screenshot of the window — the explorer measures the titlebar exactly, so the clone opens
                with the same strip, same height, same controls.
              </span>
            </div>
          )}

          <ReferenceExplorer
            target={target}
            mode={mode}
            referenceName={reference?.name ?? null}
            referenceUrl={reference?.url}
            excerpt={excerpt}
            detail={detail}
            onMap={setUiMap}
            onExplorer={setExplorer}
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-cude-textTertiary min-w-0 truncate">
              {reference
                ? `${mode === 'inspire' ? 'Inspired by' : 'Cloning'}: ${reference.name}${uiMap ? ' · explorer map ready' : ''}`
                : 'Pick something, or type a name.'}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded-lg text-cude-textSecondary hover:bg-cude-background-depth-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClone}
                disabled={!reference || busy}
                className={classNames(
                  'px-4 py-1.5 text-sm rounded-lg transition-colors',
                  'bg-cude-item-backgroundAccent text-cude-item-contentAccent',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {busy ? 'Preparing…' : mode === 'inspire' ? 'Inspire me' : 'Clone it'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </DialogRoot>
  );
}

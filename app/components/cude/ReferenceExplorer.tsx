/*
 * Cude.new - ReferenceExplorer.tsx (Cude product surface, 2026)
 *
 * The "second model" section shared by cloning and Get Inspired: pick the
 * brain that will study the reference, attach screenshots of it, and map it
 * before anything is built. The map it returns is shown for confirmation and
 * handed up, so the dialog sends evidence to the chat rather than a bare name.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { classNames } from '~/utils/classNames';
import { Combobox } from '~/components/cude/ui/Combobox';
import type { Option } from '~/lib/cude/state/listNavigation';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { CloneTarget } from '~/lib/cude/clone';
import type { ExploreMode, ExplorerSelection } from '~/lib/cude/explore';
import { MAX_SCREENSHOTS } from '~/lib/cude/explore';

interface Props {
  target: CloneTarget;
  mode: ExploreMode;
  referenceName: string | null;
  referenceUrl?: string;
  excerpt?: string;
  detail: string;
  onMap: (map: string | null) => void;
  onExplorer: (explorer: ExplorerSelection | null) => void;
}

interface ProviderOption extends Option {
  info: ProviderEntry;
}

interface ProviderEntry {
  name: string;
  staticModels?: Array<{ name: string }>;
}

interface Shot {
  name: string;
  mediaType: string;
  preview: string;
  file: File;
}

const BRAIN_PROVIDER_KEY = 'cude.brainProvider';
const BRAIN_MODEL_KEY = 'cude.brainModel';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export const ReferenceExplorer = memo(
  ({ target, mode, referenceName, referenceUrl, excerpt, detail, onMap, onExplorer }: Props) => {
    const [providerList, setProviderList] = useState<ProviderEntry[]>([]);
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [brainProvider, setBrainProvider] = useState<string | undefined>(() =>
      typeof window === 'undefined'
        ? undefined
        : window.localStorage.getItem(BRAIN_PROVIDER_KEY) || Cookies.get('selectedProvider') || undefined,
    );
    const [brainModel, setBrainModel] = useState<string | undefined>(() =>
      typeof window === 'undefined'
        ? undefined
        : window.localStorage.getItem(BRAIN_MODEL_KEY) || Cookies.get('selectedModel') || undefined,
    );
    const [shots, setShots] = useState<Shot[]>([]);
    const [mapping, setMapping] = useState(false);
    const [map, setMap] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [failure, setFailure] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const loaded = useRef(false);

    useEffect(() => {
      if (loaded.current) {
        return;
      }

      loaded.current = true;

      fetch('/api/models')
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const body = (data ?? {}) as { providers?: ProviderEntry[]; modelList?: ModelInfo[] };
          const providers = body.providers ?? [];
          const models = body.modelList ?? [];
          setProviderList(providers);
          setModelList(models);

          setBrainProvider((current) => {
            if (current && providers.some((p) => p.name === current)) {
              return current;
            }

            return providers[0]?.name;
          });
        })
        .catch(() => undefined);
    }, []);

    /*
     * The brain model follows its provider: a model from another vendor is a mismatch, not a choice.
     * The provider's own recommendation wins over the alphabet — same rule as the composer picker.
     */
    useEffect(() => {
      if (!brainProvider || modelList.length === 0) {
        return;
      }

      const offered = modelList.filter((entry) => entry.provider === brainProvider);

      if (offered.length === 0) {
        return;
      }

      const recommended =
        providerList
          .find((entry) => entry.name === brainProvider)
          ?.staticModels?.find((model) => offered.some((entry) => entry.name === model.name))?.name ?? offered[0].name;

      setBrainModel((current) => {
        if (current && offered.some((entry) => entry.name === current)) {
          return current;
        }

        return recommended;
      });
    }, [brainProvider, modelList, providerList]);

    useEffect(() => {
      if (brainProvider) {
        window.localStorage.setItem(BRAIN_PROVIDER_KEY, brainProvider);
      }
    }, [brainProvider]);

    useEffect(() => {
      if (brainModel) {
        window.localStorage.setItem(BRAIN_MODEL_KEY, brainModel);
      }
    }, [brainModel]);

    // The dialog sends whichever brain is currently picked, mapped or not.
    useEffect(() => {
      onExplorer(brainProvider && brainModel ? { provider: brainProvider, model: brainModel } : null);
    }, [brainProvider, brainModel, onExplorer]);

    const providerOptions = useMemo<ProviderOption[]>(
      () => providerList.map((info) => ({ value: info.name, label: info.name, info })),
      [providerList],
    );

    const modelOptions = useMemo<Option[]>(
      () =>
        modelList
          .filter((entry) => !brainProvider || entry.provider === brainProvider)
          .map((entry) => ({ value: entry.name, label: entry.label, detail: entry.provider })),
      [modelList, brainProvider],
    );

    const addShots = useCallback((files: FileList | File[]) => {
      const accepted = Array.from(files).filter((file) => /image\/(jpeg|png|webp)/.test(file.type));
      setShots((current) => {
        const next = [...current];

        for (const file of accepted) {
          if (next.length >= MAX_SCREENSHOTS) {
            break;
          }

          if (next.some((shot) => shot.name === file.name && shot.file.size === file.size)) {
            continue;
          }

          next.push({ name: file.name, mediaType: file.type, preview: URL.createObjectURL(file), file });
        }

        return next;
      });
    }, []);

    const removeShot = useCallback((name: string) => {
      setShots((current) => {
        const shot = current.find((entry) => entry.name === name);

        if (shot) {
          URL.revokeObjectURL(shot.preview);
        }

        return current.filter((entry) => entry.name !== name);
      });
    }, []);

    const mapIt = useCallback(async () => {
      if (!referenceName || !brainProvider || !brainModel || mapping) {
        return;
      }

      setMapping(true);
      setFailure(null);
      setWarnings([]);

      try {
        const screenshots = await Promise.all(
          shots.map(async (shot) => ({ name: shot.name, mediaType: shot.mediaType, data: await readFile(shot.file) })),
        );
        const giveUp = AbortSignal.timeout(120000);
        const response = await fetch('/api/explore-reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: giveUp,
          body: JSON.stringify({
            reference: { name: referenceName, url: referenceUrl, origin: referenceUrl ? 'url' : 'typed' },
            target,
            mode,
            detail: detail.trim() || undefined,
            excerpt,
            explorer: { provider: brainProvider, model: brainModel },
            screenshots,
          }),
        });
        const body = (await response.json()) as {
          map?: string;
          problems?: string[];
          error?: boolean;
          message?: string;
        };

        if (!response.ok || body.error || !body.map) {
          throw new Error(body.message || `The explorer answered ${response.status}.`);
        }

        setMap(body.map);
        setWarnings(body.problems ?? []);
        onMap(body.map);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'The explorer could not map this reference.');
      } finally {
        setMapping(false);
      }
    }, [referenceName, referenceUrl, target, mode, detail, excerpt, brainProvider, brainModel, shots, mapping, onMap]);

    const clearMap = useCallback(() => {
      setMap(null);
      setWarnings([]);
      onMap(null);
    }, [onMap]);

    return (
      <div className="mt-4 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-cude-textPrimary">
            Explorer <span className="text-cude-textTertiary font-normal">— the second model studies first</span>
          </h4>
          {map && (
            <button
              type="button"
              onClick={clearMap}
              className="text-xs text-cude-textSecondary hover:text-cude-textPrimary transition-colors shrink-0"
            >
              Discard map
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-cude-textSecondary">
          {mode === 'clone'
            ? 'The brain opens every screen, notes every control, and marks what must never be touched. The builder then clones from that map.'
            : 'The brain reads the design language — layout rhythm, tone, tokens. The builder then draws something new in that spirit, not a copy.'}
        </p>

        <div className="mt-3 flex flex-col gap-1.5 sm:flex-row">
          <Combobox
            className="sm:w-40"
            label="Brain provider"
            placeholder="Brain provider"
            searchPlaceholder="Search providers"
            emptyMessage="No provider matches that."
            options={providerOptions}
            value={brainProvider}
            onChange={(option) => setBrainProvider(option.value)}
          />
          <Combobox
            className="flex-1"
            label="Brain model"
            placeholder={brainProvider ? 'Brain model' : 'Choose a provider first'}
            searchPlaceholder="Search models"
            emptyMessage="No model matches that. Add an API key if the list looks empty."
            options={modelOptions}
            value={brainModel}
            disabled={!brainProvider}
            onChange={(option) => setBrainModel(option.value)}
          />
        </div>

        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                addShots(event.target.files);
              }

              event.target.value = '';
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-lg border border-cude-borderColor text-cude-textPrimary hover:bg-cude-background-depth-3 transition-colors"
            >
              Attach screenshots ({shots.length}/{MAX_SCREENSHOTS})
            </button>
            <span className="text-xs text-cude-textTertiary">JPEG, PNG or WebP — the brain reads what it can see.</span>
          </div>
          {shots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {shots.map((shot) => (
                <button
                  key={shot.name}
                  type="button"
                  onClick={() => removeShot(shot.name)}
                  title={`${shot.name} — click to remove`}
                  className="relative h-14 w-14 overflow-hidden rounded-md border border-cude-borderColor group"
                >
                  <img src={shot.preview} alt={shot.name} className="h-full w-full object-cover" />
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs text-white group-hover:flex">
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {failure && <p className="mt-2 text-xs text-red-400">{failure}</p>}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={mapIt}
            disabled={!referenceName || !brainProvider || !brainModel || mapping}
            className={classNames(
              'px-4 py-1.5 text-sm rounded-lg transition-colors',
              'bg-cude-background-depth-3 text-cude-textPrimary hover:bg-cude-background-depth-4',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {mapping ? 'Mapping…' : map ? 'Map again' : 'Map the reference first'}
          </button>
          {!referenceName && <span className="text-xs text-cude-textTertiary">Name a reference above first.</span>}
        </div>

        {map && (
          <div className="mt-3">
            {warnings.length > 0 && (
              <p className="mb-1 text-xs text-amber-400">Thin spots the builder should know: {warnings.join(' ')}</p>
            )}
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-cude-background-depth-1 p-3 text-xs text-cude-textSecondary">
              {map}
            </pre>
          </div>
        )}
      </div>
    );
  },
);

ReferenceExplorer.displayName = 'ReferenceExplorer';

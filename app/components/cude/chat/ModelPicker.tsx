/**
 * Cude.new - choosing the provider and model.
 *
 * Two searchable lists side by side, both built from the same combobox. The
 * component this replaces was around nine hundred lines, most of it two
 * hand-written comboboxes that had drifted apart.
 *
 * The one piece of real logic here is the local-provider status dot: a provider
 * running on your own machine can be configured and simply not be running, and
 * an empty model list with no explanation is the least useful thing the picker
 * can show.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { LOCAL_PROVIDERS } from '~/lib/cude/state/settings';
import { classNames } from '~/utils/classNames';
import { Combobox } from '~/components/cude/ui/Combobox';
import type { Option } from '~/lib/cude/state/listNavigation';

export interface ModelPickerProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  modelLoading?: string;
}

type Reachability = 'unknown' | 'reachable' | 'unreachable';

interface ProviderOption extends Option {
  info: ProviderInfo;
}

/** Asks a local provider whether it is actually running. */
async function probeLocalProvider(provider: ProviderInfo): Promise<Reachability> {
  const base = (provider as { settings?: { baseUrl?: string } }).settings?.baseUrl;

  if (!base) {
    return 'unknown';
  }

  try {
    /*
     * `no-cors` gives an opaque response, which is enough: the question is
     * whether anything answered, not what it said.
     */
    await fetch(base, { mode: 'no-cors', signal: AbortSignal.timeout(2500) });

    return 'reachable';
  } catch {
    return 'unreachable';
  }
}

function StatusDot({ state }: { state: Reachability }) {
  if (state === 'unknown') {
    return null;
  }

  return (
    <span
      title={state === 'reachable' ? 'Running' : 'Not reachable'}
      aria-label={state === 'reachable' ? 'Running' : 'Not reachable'}
      className={classNames(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        state === 'reachable' ? 'bg-cude-icon-success' : 'bg-cude-item-contentDanger',
      )}
    />
  );
}

/**
 * A model in the picker.
 *
 * `published` is a fact about the model, not about list navigation, so it
 * lives here rather than on the shared `Option`.
 */
interface ModelOption extends Option {
  published?: boolean;
}

export const ModelPicker = memo(
  ({ model, setModel, provider, setProvider, modelList, providerList, modelLoading }: ModelPickerProps) => {
    const [reachability, setReachability] = useState<Record<string, Reachability>>({});

    const providerOptions = useMemo<ProviderOption[]>(
      () =>
        providerList.map((info) => ({
          value: info.name,
          label: info.name,
          detail: LOCAL_PROVIDERS.includes(info.name) ? 'local' : undefined,
          info,
        })),
      [providerList],
    );

    const modelOptions = useMemo<ModelOption[]>(
      () =>
        modelList
          .filter((entry) => !provider || entry.provider === provider.name)
          .map((entry) => ({
            value: entry.name,
            label: entry.label,
            detail: entry.provider,

            /* Carried so the opening choice can prefer one that still exists. */
            published: entry.published,
          })),
      [modelList, provider],
    );

    /*
     * A provider always arrives with a model already chosen.
     *
     * Switching provider left the previous provider's model selected, and the
     * control simply read "Model" — the field a person has to fill before
     * anything can be sent, with nothing saying so. Worse when the old id
     * happened to exist under the new provider too: the choice looked
     * deliberate and was not.
     *
     * Only when the current one is not on offer, so a model somebody picked is
     * never taken away from them.
     */
    useEffect(() => {
      if (!provider || modelOptions.length === 0) {
        return;
      }

      if (modelOptions.some((option) => option.value === model)) {
        return;
      }

      /*
       * The provider's own recommendation, as long as it still exists.
       *
       * Two things had to be got right. The list is sorted by label so a
       * person can find a name, which puts "Claude 3.5 Sonnet" ahead of
       * "Claude Opus 5" — so `options[0]` opened on the oldest model in the
       * catalogue. And the hand-written order that replaced it rots: ten
       * providers were leading with a model their vendor has since retired,
       * so following it blindly meant opening on something that answers 404.
       *
       * The public registry is the check. A model it still lists is one that
       * can still be reached.
       */
      /*
       * `=== true`, not `!== false`.
       *
       * The registry marks what it lists and says nothing about the rest, so a
       * retired model arrives unmarked rather than marked false. Read
       * leniently, OpenRouter still opened on Claude 3.5 Sonnet — the very
       * model this was written to avoid.
       *
       * When nothing is marked at all the registry has never heard of this
       * provider — a private gateway, a vendor added last week — and an empty
       * picker would be worse than an unverified model.
       */
      const published = modelOptions.filter((option) => option.published === true);
      const usable = published.length > 0 ? published : modelOptions;

      const recommended = provider.staticModels?.find((model) =>
        usable.some((option) => option.value === model.name),
      )?.name;

      setModel?.(recommended ?? usable[0].value);
    }, [provider, modelOptions, model, setModel]);

    useEffect(() => {
      let cancelled = false;
      const locals = providerList.filter((info) => LOCAL_PROVIDERS.includes(info.name));

      if (locals.length === 0) {
        return undefined;
      }

      Promise.all(locals.map(async (info) => [info.name, await probeLocalProvider(info)] as const)).then((entries) => {
        if (!cancelled) {
          setReachability(Object.fromEntries(entries));
        }
      });

      return () => {
        cancelled = true;
      };
    }, [providerList]);

    return (
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Combobox
          className="sm:w-44"
          label="Provider"
          placeholder="Provider"
          searchPlaceholder="Search providers"
          emptyMessage="No provider matches that."
          options={providerOptions}
          value={provider?.name}
          onChange={(option) => setProvider?.(option.info)}
          renderTrailing={(option) => <StatusDot state={reachability[option.value] ?? 'unknown'} />}
        />

        <Combobox
          className="flex-1"
          label="Model"
          placeholder={provider ? 'Model' : 'Choose a provider first'}
          searchPlaceholder="Search models"
          emptyMessage={
            modelLoading ? 'Loading models.' : 'No model matches that. Add an API key if the list looks empty.'
          }
          options={modelOptions}
          value={model}
          disabled={!provider}
          loading={modelLoading === 'all' || modelLoading === provider?.name}
          onChange={(option) => setModel?.(option.value)}
        />
      </div>
    );
  },
);

ModelPicker.displayName = 'ModelPicker';

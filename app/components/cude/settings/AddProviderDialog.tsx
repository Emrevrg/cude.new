/*
 * Cude.new - AddProviderDialog.tsx (Cude product surface, 2026)
 *
 * Adding an endpoint of your own to the provider list: a gateway at work, a
 * proxy, a model server on another machine. It has to speak the OpenAI API,
 * which is the one contract an arbitrary endpoint can be expected to honour.
 */
import { useCallback, useState } from 'react';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import { addCustomProvider, validateCustomProvider, readCustomProviders } from '~/lib/cude/providers/customProviders';

interface Props {
  open: boolean;
  onClose: () => void;

  /** Told once a provider has been stored, so the list can pick it up. */
  onAdded: () => void;

  /** Names already taken by the providers that ship with Cude. */
  builtInNames: string[];
}

const FIELD = classNames(
  'w-full px-3 py-2 rounded-lg text-sm',
  'bg-cude-background-depth-2 text-cude-textPrimary placeholder:text-cude-textTertiary',
  'border border-cude-borderColor focus:outline-none focus:ring-1 focus:ring-cude-item-contentAccent',
);

export function AddProviderDialog({ open, onClose, onAdded, builtInNames }: Props) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName('');
    setBaseUrl('');
    setApiKey('');
    setModels('');
    setProblem(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const save = useCallback(() => {
    const candidate = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      models: models
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    };

    // Checked here so the reason lands next to the field that caused it.
    const check = validateCustomProvider(candidate, readCustomProviders(), builtInNames);

    if (!check.ok) {
      setProblem(check.problem ?? 'That will not work.');
      return;
    }

    const stored = addCustomProvider(candidate, builtInNames);

    if (!stored.ok) {
      setProblem(stored.problem ?? 'Could not save it.');
      return;
    }

    onAdded();
    close();
  }, [name, baseUrl, apiKey, models, builtInNames, onAdded, close]);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      {open && (
        <Dialog className="max-w-lg w-full p-6" onClose={close}>
          <DialogTitle>Add a provider</DialogTitle>
          <DialogDescription className="mt-1">
            Any endpoint that speaks the OpenAI API — a gateway at work, a proxy, a server on your network.
          </DialogDescription>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-cude-textSecondary">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setProblem(null);
                }}
                placeholder="Work gateway"
                className={classNames(FIELD, 'mt-1')}
              />
            </label>

            <label className="block">
              <span className="text-xs text-cude-textSecondary">Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  setProblem(null);
                }}
                placeholder="https://ai.example.com/v1"
                className={classNames(FIELD, 'mt-1')}
              />
            </label>

            <label className="block">
              <span className="text-xs text-cude-textSecondary">API key — leave empty if it needs none</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-…"
                className={classNames(FIELD, 'mt-1')}
              />
            </label>

            <label className="block">
              <span className="text-xs text-cude-textSecondary">
                Models — optional, comma separated. Cude asks the endpoint for the rest.
              </span>
              <input
                value={models}
                onChange={(event) => setModels(event.target.value)}
                placeholder="llama-3-70b, mixtral-8x7b"
                className={classNames(FIELD, 'mt-1')}
              />
            </label>
          </div>

          {problem && (
            <p className="mt-3 text-sm text-cude-item-contentDanger" role="alert">
              {problem}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 text-sm rounded-lg text-cude-textSecondary hover:bg-cude-background-depth-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={name.trim().length < 2 || baseUrl.trim().length === 0}
              className={classNames(
                'px-4 py-1.5 text-sm rounded-lg transition-colors',
                'bg-cude-item-backgroundAccent text-cude-item-contentAccent',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              Add it
            </button>
          </div>
        </Dialog>
      )}
    </DialogRoot>
  );
}

/**
 * Cude.new - publishing a project to GitHub or GitLab.
 *
 * One dialog for both. It asks for a name and a visibility, hands them to the
 * publish domain, and shows what went where. The two it replaces were about
 * eighteen hundred lines between them, most of it the same form and the same
 * six-request commit sequence written twice.
 *
 * The dialog holds no token. It asks the domain to publish; the domain reads
 * the connection.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ExternalLink, Loader2, Lock, Unlock, X } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import {
  publishRepository,
  sanitizeRepositoryName,
  describeFiles,
  type PublishResult,
  type PublishService,
} from '~/lib/cude/state/repositoryPublish';
import { useServiceConnection } from '~/lib/cude/state/useServiceConnection';
import { describeService } from '~/lib/cude/state/serviceDescriptors';
import { ConnectDialog } from './ConnectDialog';

export interface PublishDialogProps {
  service: PublishService;
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, string>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PublishDialog({ service, isOpen, onClose, projectName, files }: PublishDialogProps) {
  const { isConnected } = useServiceConnection(service);
  const label = describeService(service)?.label ?? service;

  const [name, setName] = useState(() => sanitizeRepositoryName(projectName));
  const [isPrivate, setIsPrivate] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  // A new project means a new dialog, even if the last one was never dismissed.
  useEffect(() => {
    if (isOpen) {
      setName(sanitizeRepositoryName(projectName));
      setResult(null);
      setError(null);
    }
  }, [isOpen, projectName]);

  const summary = useMemo(() => {
    const described = describeFiles(files);

    return { count: described.length, bytes: described.reduce((total, file) => total + file.size, 0) };
  }, [files]);

  const publish = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setPublishing(true);
      setError(null);

      try {
        setResult(await publishRepository({ service, name, isPrivate, files }));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setPublishing(false);
      }
    },
    [service, name, isPrivate, files],
  );

  const sanitized = sanitizeRepositoryName(name);

  return (
    <>
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />

          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10000] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-base font-medium text-cude-textPrimary">
                {result ? 'Published' : `Publish to ${label}`}
              </Dialog.Title>

              <Dialog.Close
                aria-label="Close"
                className="rounded-lg p-1 text-cude-textTertiary hover:text-cude-textPrimary"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {result ? (
              <div className="mt-4">
                <div className="flex items-start gap-3 rounded-lg border border-cude-borderColorActive/30 bg-cude-item-backgroundAccent px-3 py-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cude-icon-success" />

                  <div className="min-w-0">
                    <p className="text-sm text-cude-textPrimary">
                      {result.created ? 'Created the repository and pushed' : 'Pushed'} {result.files.length} files to{' '}
                      <span className="font-medium">{result.branch}</span>.
                    </p>

                    <a
                      href={result.repoUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-cude-textSecondary underline hover:text-cude-textPrimary"
                    >
                      {result.repoUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <ul className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {result.files.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center justify-between gap-3 rounded px-2 py-1 text-[11px] text-cude-textTertiary"
                    >
                      <span className="truncate">{file.path}</span>
                      <span className="shrink-0">{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <form onSubmit={publish} className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-cude-textSecondary">Repository name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    spellCheck={false}
                    className="w-full rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2 text-sm text-cude-textPrimary focus:border-cude-borderColorActive focus:outline-none"
                  />

                  {sanitized !== name.trim() && sanitized && (
                    <span className="text-[11px] text-cude-textTertiary">
                      Will be published as <span className="text-cude-textSecondary">{sanitized}</span>.
                    </span>
                  )}
                </label>

                <div className="flex gap-2">
                  {[
                    { value: true, label: 'Private', icon: Lock },
                    { value: false, label: 'Public', icon: Unlock },
                  ].map((option) => {
                    const OptionIcon = option.icon;
                    const { value, label: optionLabel } = option;

                    return (
                      <button
                        key={optionLabel}
                        type="button"
                        onClick={() => setIsPrivate(value)}
                        className={classNames(
                          'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                          isPrivate === value
                            ? 'border-cude-borderColorActive text-cude-textPrimary'
                            : 'border-cude-borderColor text-cude-textTertiary hover:text-cude-textSecondary',
                        )}
                      >
                        <OptionIcon className="h-3.5 w-3.5" />
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-cude-textTertiary">
                  {summary.count} files, {formatBytes(summary.bytes)}. Existing files with the same paths are updated;
                  anything else in the repository is left alone.
                </p>

                {error && <p className="text-sm text-cude-item-contentDanger">{error}</p>}

                {isConnected ? (
                  <button
                    type="submit"
                    disabled={publishing || !sanitized}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-cude-button-primary-background px-3 py-2 text-sm font-medium text-cude-button-primary-text hover:bg-cude-button-primary-backgroundHover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {publishing ? 'Publishing' : `Publish to ${label}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConnect(true)}
                    className="rounded-lg border border-cude-borderColor px-3 py-2 text-sm text-cude-textSecondary hover:text-cude-textPrimary"
                  >
                    Connect {label} to publish
                  </button>
                )}
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConnectDialog service={service} isOpen={showConnect} onClose={() => setShowConnect(false)} />
    </>
  );
}

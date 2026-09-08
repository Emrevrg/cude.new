/**
 * Cude.new - what this build changed.
 *
 * A searchable list of the files the current build has touched, with the size
 * of each change, so a long generation can be followed without opening every
 * file.
 *
 * It reads the workspace directly. The version it replaces read a record that
 * the Diff view populated while rendering, so the list stayed empty until
 * someone happened to open that view.
 */

import { Fragment, memo, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Popover, Transition } from '@headlessui/react';
import { Search } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { diffText } from '~/lib/cude/state/workspace/diffModel';
import { extractRelativePath } from '~/utils/diff';

export interface ChangedFilesMenuProps {
  onSelectFile: (path: string) => void;
}

/** Current text of a file, or '' when it is missing or not text. */
function currentContentOf(path: string): string {
  const node = workbenchStore.files.get()[path];

  return node && node.type === 'file' && !node.isBinary ? node.content : '';
}

function ChangeCount({ path }: { path: string }) {
  const diff = useMemo(() => diffText(workbenchStore.baselineFor(path) ?? '', currentContentOf(path)), [path]);

  if (diff.added === 0 && diff.removed === 0) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
      {diff.added > 0 && <span className="text-cude-icon-success">+{diff.added}</span>}
      {diff.removed > 0 && <span className="text-cude-item-contentDanger">−{diff.removed}</span>}
    </span>
  );
}

export const ChangedFilesMenu = memo(({ onSelectFile }: ChangedFilesMenuProps) => {
  const changed = useStore(workbenchStore.changedByBuild);
  const [query, setQuery] = useState('');

  const paths = useMemo(() => [...changed].sort(), [changed]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return needle ? paths.filter((path) => path.toLowerCase().includes(needle)) : paths;
  }, [paths, query]);

  return (
    <Popover className="relative">
      {({ open }: { open: boolean }) => (
        <>
          <Popover.Button
            className={classNames(
              'shrink-0 h-7 px-2 rounded-md flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors',
              'text-cude-textSecondary hover:text-cude-textPrimary hover:bg-cude-background-depth-3',
            )}
          >
            <span>Changes</span>

            {paths.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-cude-borderColor px-1 text-[10px] tabular-nums text-cude-textPrimary">
                {paths.length}
              </span>
            )}
          </Popover.Button>

          <Transition
            as={Fragment}
            show={open}
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Popover.Panel className="absolute right-0 z-20 mt-2 w-80 origin-top-right rounded-xl border border-cude-borderColor bg-cude-background-depth-2 shadow-xl">
              <div className="p-2">
                {paths.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-cude-textTertiary">
                    This build has not changed any files yet.
                  </p>
                ) : (
                  <>
                    <div className="relative mx-1 mb-2">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cude-textTertiary" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search files"
                        aria-label="Search changed files"
                        className="w-full rounded-lg border border-cude-borderColor bg-cude-background-depth-1 py-1.5 pl-8 pr-3 text-sm text-cude-textPrimary placeholder:text-cude-textTertiary focus:border-cude-borderColorActive focus:outline-none"
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      {matches.length === 0 && (
                        <p className="px-3 py-4 text-center text-xs text-cude-textTertiary">Nothing matches that.</p>
                      )}

                      {matches.map((path) => (
                        <button
                          key={path}
                          onClick={() => onSelectFile(path)}
                          className="flex w-full items-center gap-3 rounded-md bg-transparent px-3 py-2 text-left transition-colors hover:bg-cude-background-depth-1"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-cude-textPrimary">
                              {path.split('/').pop()}
                            </span>
                            <span className="block truncate text-[11px] text-cude-textTertiary">
                              {extractRelativePath(path)}
                            </span>
                          </span>

                          <ChangeCount path={path} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
});

ChangedFilesMenu.displayName = 'ChangedFilesMenu';

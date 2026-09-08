/**
 * Cude.new - the project's files.
 *
 * A flat, ordered list rendered with indentation, which is what a file tree
 * actually is. The shape of the tree — what exists, what order, what is hidden,
 * what a collapsed folder conceals — is decided in `fileTreeModel` and tested
 * there; this renders the result and handles the pointer.
 *
 * The component it replaces was nine hundred lines with the tree arithmetic,
 * three context menus, an inline input and a diff-status computation all in the
 * same file.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronDown, ChevronRight, File as FileIcon, Folder, FolderOpen, Lock } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { buildTree, visibleNodes, DEFAULT_HIDDEN, type TreeNode } from '~/lib/cude/state/workspace/fileTreeModel';
import type { FileMap } from '~/lib/cude/state/workspace';

export interface FileTreeSurfaceProps {
  files?: FileMap;
  selectedFile?: string;
  onFileSelect?: (path: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;

  /** Files changed since the build began, marked so they are easy to find. */
  changedFiles?: ReadonlySet<string>;
  className?: string;
}

const INDENT = 10;

function MenuItem({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-2 py-1.5 text-sm text-cude-textSecondary outline-none data-[highlighted]:bg-cude-item-backgroundActive data-[highlighted]:text-cude-textPrimary"
    >
      {children}
    </ContextMenu.Item>
  );
}

function Row({
  node,
  selected,
  unsaved,
  changed,
  locked,
  collapsed,
  onActivate,
}: {
  node: TreeNode;
  selected: boolean;
  unsaved: boolean;
  changed: boolean;
  locked: boolean;
  collapsed: boolean;
  onActivate: () => void;
}) {
  const isFolder = node.kind === 'folder';
  const displayName = node.name === '.cude' ? 'cude.new' : node.name;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={displayName}
      aria-current={selected ? 'true' : undefined}
      aria-expanded={isFolder ? !collapsed : undefined}
      style={{ paddingLeft: `${8 + node.depth * INDENT}px` }}
      className={classNames(
        'flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm transition-colors',
        selected
          ? 'bg-cude-item-backgroundAccent text-cude-textPrimary'
          : 'text-cude-textSecondary hover:bg-cude-item-backgroundActive hover:text-cude-textPrimary',
      )}
    >
      {isFolder ? (
        <>
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          )}
          {collapsed ? <Folder className="h-3.5 w-3.5 shrink-0" /> : <FolderOpen className="h-3.5 w-3.5 shrink-0" />}
        </>
      ) : (
        <>
          <span className="w-3 shrink-0" />
          <FileIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </>
      )}

      <span className="truncate" title={node.name === displayName ? undefined : `${node.name} · CUDE project metadata`}>
        {displayName}
      </span>

      {locked && <Lock className="ml-auto h-3 w-3 shrink-0 opacity-60" aria-label="Locked" />}

      {(unsaved || changed) && (
        <span
          aria-label={unsaved ? 'Unsaved changes' : 'Changed in this build'}
          title={unsaved ? 'Unsaved changes' : 'Changed in this build'}
          className={classNames(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            unsaved ? 'bg-amber-500' : 'bg-cude-textTertiary',
            locked ? 'ml-1.5' : 'ml-auto',
          )}
        />
      )}
    </button>
  );
}

export const FileTreeSurface = memo(
  ({
    files = {},
    selectedFile,
    onFileSelect,
    rootFolder = '/',
    hideRoot = false,
    hiddenFiles = DEFAULT_HIDDEN,
    unsavedFiles,
    changedFiles,
    className,
  }: FileTreeSurfaceProps) => {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

    const nodes = useMemo(
      () => buildTree(files, { root: rootFolder, hideRoot, hidden: hiddenFiles }),
      [files, rootFolder, hideRoot, hiddenFiles],
    );

    const shown = useMemo(() => visibleNodes(nodes, collapsed), [nodes, collapsed]);

    const toggle = useCallback((path: string) => {
      setCollapsed((current) => {
        const next = new Set(current);

        if (!next.delete(path)) {
          next.add(path);
        }

        return next;
      });
    }, []);

    if (shown.length === 0) {
      return (
        <div className={classNames('flex h-full items-center justify-center px-4 text-center', className)}>
          <p className="text-xs text-cude-textTertiary">
            Project files will appear here as the Builder generates them.
          </p>
        </div>
      );
    }

    return (
      <div className={classNames('overflow-auto py-1', className)}>
        {shown.map((node) => {
          const isFolder = node.kind === 'folder';
          const locked = isFolder ? workbenchStore.isFolderLocked(node.path) : workbenchStore.isFileLocked(node.path);

          return (
            <ContextMenu.Root key={node.path}>
              <ContextMenu.Trigger asChild>
                <div>
                  <Row
                    node={node}
                    selected={node.path === selectedFile}
                    unsaved={Boolean(unsavedFiles?.has(node.path))}
                    changed={Boolean(changedFiles?.has(node.path))}
                    locked={Boolean(locked)}
                    collapsed={collapsed.has(node.path)}
                    onActivate={() => (isFolder ? toggle(node.path) : onFileSelect?.(node.path))}
                  />
                </div>
              </ContextMenu.Trigger>

              <ContextMenu.Portal>
                <ContextMenu.Content className="z-50 min-w-[180px] rounded-lg border border-cude-borderColor bg-cude-background-depth-1 p-1 shadow-lg">
                  <MenuItem onSelect={() => navigator.clipboard?.writeText(node.path)}>Copy path</MenuItem>

                  <MenuItem
                    onSelect={() =>
                      navigator.clipboard?.writeText(
                        node.path.startsWith(rootFolder) ? node.path.slice(rootFolder.length + 1) : node.path,
                      )
                    }
                  >
                    Copy relative path
                  </MenuItem>

                  <ContextMenu.Separator className="my-1 h-px bg-cude-borderColor" />

                  <MenuItem
                    onSelect={() =>
                      locked
                        ? isFolder
                          ? workbenchStore.unlockFolder(node.path)
                          : workbenchStore.unlockFile(node.path)
                        : isFolder
                          ? workbenchStore.lockFolder(node.path)
                          : workbenchStore.lockFile(node.path)
                    }
                  >
                    {locked ? 'Unlock' : 'Lock so Cude cannot change it'}
                  </MenuItem>

                  <ContextMenu.Separator className="my-1 h-px bg-cude-borderColor" />

                  <ContextMenu.Item
                    onSelect={() =>
                      isFolder ? workbenchStore.deleteFolder(node.path) : workbenchStore.deleteFile(node.path)
                    }
                    className="cursor-pointer rounded px-2 py-1.5 text-sm text-cude-item-contentDanger outline-none data-[highlighted]:bg-cude-item-contentDanger/10"
                  >
                    Delete
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          );
        })}
      </div>
    );
  },
);

FileTreeSurface.displayName = 'FileTreeSurface';

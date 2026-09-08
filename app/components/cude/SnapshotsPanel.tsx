/**
 * Cude.new - SnapshotsPanel.tsx (Cude product surface, 2026)
 *
 * The named file snapshots in localStorage: list, restore, drop. A
 * restored snapshot replaces the workspace files in place, so the editor,
 * preview and diff all react to the same change a pipeline file write would.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { readSnapshots, deleteSnapshot, type FileSnapshot } from '~/lib/cude/snapshots';
import { toast } from 'react-toastify';

function formatDate(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SnapshotsPanel = memo(() => {
  const [snapshots, setSnapshots] = useState<FileSnapshot[]>(() => {
    try {
      return readSnapshots();
    } catch {
      return [];
    }
  });

  const refresh = useCallback(() => setSnapshots(readSnapshots()), []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'cude.fileSnapshots') {
        refresh();
      }
    };

    window.addEventListener('storage', onStorage);

    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const restore = useCallback(async (snapshot: FileSnapshot) => {
    try {
      const files = snapshot.files as never;
      await workbenchStore.restoreDocuments(files);
      workbenchStore.showWorkbench.set(true);
      workbenchStore.currentView.set('code');
      toast.success(`Restored “${snapshot.label}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The snapshot could not be restored.');
    }
  }, []);

  if (snapshots.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
        <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">SNAPSHOTS</div>
        <p className="text-sm text-cude-textSecondary">
          Save a named copy from the Snapshot button in the toolbar — then find it here to jump back.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-1 overflow-hidden">
      <div className="px-4 py-2 border-b border-cude-borderColor flex items-center justify-between gap-2">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">
          SNAPSHOTS — {snapshots.length}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-cude-textSecondary hover:text-cude-textPrimary transition-colors"
          title="Refresh the list"
        >
          Refresh
        </button>
      </div>
      <div className="divide-y divide-cude-borderColor">
        {snapshots.map((snapshot) => (
          <div
            key={snapshot.id}
            className={classNames('flex items-center gap-3 px-4 py-2.5', 'hover:bg-cude-background-depth-2')}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-cude-textPrimary truncate">{snapshot.label}</div>
              <div className="text-xs text-cude-textTertiary">{formatDate(snapshot.createdAt)}</div>
            </div>
            <button
              type="button"
              onClick={() => void restore(snapshot)}
              className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-cude-background-depth-3 text-cude-textPrimary hover:bg-cude-background-depth-4 transition-colors"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => {
                deleteSnapshot(snapshot.id);
                refresh();
              }}
              className="shrink-0 px-2 py-1 text-xs rounded-md text-cude-textSecondary hover:text-cude-textPrimary transition-colors"
              title="Delete this snapshot"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

SnapshotsPanel.displayName = 'SnapshotsPanel';

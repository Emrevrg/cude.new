// Cude.new - HeaderActionButtons.client.tsx (Cude product surface, 2026)
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { DeployButton } from '~/components/deploy/DeployButton';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { ShortcutsDialog } from '~/components/cude/ShortcutsDialog';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[0];
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /*
   * Keep the workspace actions visible as soon as a build starts. Waiting for
   * a preview made the header appear to lose its three actions during the
   * exact phase where users need diagnostics or a bug report.
   */
  const shouldShowButtons = Boolean(activePreview || _chatStarted);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-cude-borderColor px-2.5 text-xs text-cude-textSecondary transition-colors hover:border-cude-borderColorActive hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
        title="Keyboard shortcuts"
      >
        <span className="i-ph:keyboard" aria-hidden="true" />
        <span className="hidden sm:inline">Shortcuts</span>
      </button>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/* Deploy Button */}
      {shouldShowButtons && <DeployButton />}

      {shouldShowButtons && (
        <>
          <button
            type="button"
            onClick={() => window.open('https://github.com/Emrevrg/cude.new/issues/new', '_blank')}
            className="flex h-8 items-center gap-1.5 rounded-md border border-cude-borderColor px-2.5 text-xs text-cude-textSecondary transition-colors hover:border-cude-borderColorActive hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
            title="Report a bug"
          >
            <span className="i-ph:bug" aria-hidden="true" />
            <span className="hidden sm:inline">Report bug</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const { downloadReport } = await import('~/lib/cude/state/diagnostics');
                downloadReport();
              } catch (error) {
                logStore.logError('Could not build the diagnostic report', error);
              }
            }}
            className="flex h-8 items-center gap-1.5 rounded-md border border-cude-borderColor px-2.5 text-xs text-cude-textSecondary transition-colors hover:border-cude-borderColorActive hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
            title="Download diagnostics"
          >
            <span className="i-ph:activity" aria-hidden="true" />
            <span className="hidden sm:inline">Diagnostics</span>
          </button>
        </>
      )}
    </div>
  );
}

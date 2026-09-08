// Cude.new - Header.tsx (Cude product surface, 2026)
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { sidebarOpen, toggleSidebar } from '~/lib/cude/state/sidebar';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/cude/state/ChatDescription.client';
import { CudeLogo } from '~/components/cude/CudeLogo';
import { cudeStatusStore, formatPipelineStatus, pipelineStore, platformStore } from '~/lib/stores/cude';
import { workbenchStore } from '~/lib/stores/workbench';
import { PROJECT_TYPE_CONFIGS } from '~/lib/cude/platform';

export function Header() {
  const chat = useStore(chatStore);
  const isSidebarOpen = useStore(sidebarOpen);
  const cudeStatus = useStore(cudeStatusStore);
  const pipeline = useStore(pipelineStore);
  const files = useStore(workbenchStore.files);
  const platform = useStore(platformStore);
  const platCfg = PROJECT_TYPE_CONFIGS[platform];
  const hasWorkspaceOutput = Object.keys(files).length > 0;
  const builderHasOutput = pipeline.agents.some((agent) => agent.id === 'builder' && agent.status === 'complete');
  const headerStatus =
    cudeStatus === 'design_review' && (hasWorkspaceOutput || builderHasOutput)
      ? 'Workspace ready'
      : formatPipelineStatus(cudeStatus);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)] bg-cude-background-depth-1', {
        'border-transparent': !chat.started,
        'border-cude-borderColor': chat.started,
      })}
    >
      <div className="flex shrink-0 items-center gap-2 z-logo text-cude-textPrimary">
        {/* Was a bare icon with nothing behind it: the panel could only be
            opened by finding the left edge with the pointer. */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? 'Hide your work' : 'Show your work'}
          aria-expanded={isSidebarOpen}
          title="Your work"
          className="p-1 -ml-1 rounded transition-colors hover:bg-cude-background-depth-2 text-cude-textPrimary"
        >
          <div
            className={classNames('text-xl transition-opacity', {
              'i-ph:sidebar-simple-fill opacity-90': isSidebarOpen,
              'i-ph:sidebar-simple-duotone opacity-60': !isSidebarOpen,
            })}
          />
        </button>
        <a href="/" className="flex items-center">
          <CudeLogo />
        </a>
        <span className="hidden lg:inline-flex ml-3 items-center gap-2">
          <span className="px-2 py-0.5 rounded border border-cude-borderColor bg-cude-background-depth-2 text-[10px] tracking-widest font-medium text-cude-textSecondary">
            {platCfg.shortLabel}
          </span>
          <span className="px-2 py-0.5 rounded bg-cude-textPrimary text-cude-background-depth-1 text-[10px] tracking-widest font-semibold border border-cude-borderColor">
            {headerStatus}
          </span>
        </span>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="min-w-0 flex-1 px-4 truncate text-center text-cude-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-cude-borderColor px-2 py-1 text-xs"
                  onClick={() => workbenchStore.showWorkbench.set(!workbenchStore.showWorkbench.get())}
                  aria-label="Toggle workspace"
                >
                  Workspace
                </button>
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
    </header>
  );
}

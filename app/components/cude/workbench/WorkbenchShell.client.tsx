/**
 * Cude.new - the workspace.
 *
 * A shell: it owns the panel's geometry and which view is showing, and composes
 * everything else from parts that live on their own. The toolbar pieces, the
 * changed-files menu, the editor, the diff and the preview are each somewhere
 * else, so this file can be read in one sitting.
 *
 * Toolbar layout follows the measured width of the panel rather than the
 * window, because with the conversation open the panel is a little over half
 * what the window reports and a viewport breakpoint clips the last tab.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { computed } from 'nanostores';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { streamingState } from '~/lib/stores/streaming';
import useViewport from '~/lib/hooks';
import { useElementWidth } from '~/lib/cude/state/useElementWidth';
import { useConversationHistory } from '~/lib/cude/state/useConversationHistory';
import {
  pipelineStore,
  designSystemStore,
  designSystemStatusStore,
  architectureStore,
  designContractStore,
} from '~/lib/stores/cude';
import type { PipelineState } from '~/lib/cude/agents';

import { EditorPanel } from '~/components/workbench/EditorPanel';
import type { ElementInfo } from '~/components/workbench/Inspector';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';

import { DiffSurface } from './DiffSurface';
import { PreviewSurface } from './PreviewSurface';
import { ChangedFilesMenu } from './ChangedFilesMenu';
import { EngineeringStatusStrip, InspectorTab, ToolbarAction, ToolbarDivider } from './toolbar';
import { getSyncedFolder, setSyncedFolder } from '~/lib/cude/folderSync';

import { AgentTimeline } from '~/components/cude/AgentTimeline';
import { designSystemToCssVars } from '~/lib/cude/designSystem';
import { SnapshotsPanel } from '~/components/cude/SnapshotsPanel';
import { ThemeStudio } from '~/components/cude/ThemeStudio';
import { ArchitectureDecisionPanel } from '~/components/cude/ArchitectureDecisionPanel';
import { DesignReviewPanel } from '~/components/cude/DesignReviewPanel';
import { AddPlatformPanel } from '~/components/cude/AddPlatformPanel';
import { ProductGraphPanel } from '~/components/cude/ProductGraphPanel';

export interface WorkbenchShellProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  setSelectedElement?: (element: ElementInfo | null) => void;
}

/** Which secondary panel is open above the editor, if any. */
type InspectorPanel = 'agents' | 'design' | 'product' | 'architecture' | 'graph' | 'theme' | 'history' | null;

/** Compact badge text per pipeline status; the tab strip has little room. */
const PIPELINE_STATUS_BADGE: Record<PipelineState['status'], string> = {
  idle: '',
  planning: 'PLAN',
  designing: 'DESIGN',
  design_review: 'REVIEW',
  design_approved: 'APPROVED',
  building: 'BUILD',
  running: 'RUN',
  testing: 'TEST',
  repairing: 'REPAIR',
  reviewing: 'REVIEW',
  integrating: 'INTEGRATE',
  needs_user_action: 'ACTION',
  verified: 'VERIFIED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const SLIDER_OPTIONS: SliderOptions<WorkbenchViewType> = {
  left: { value: 'code', text: 'Code' },
  middle: { value: 'diff', text: 'Diff' },
  right: { value: 'preview', text: 'Preview' },
};

const PANEL_VARIANTS = {
  closed: { width: 0, transition: { duration: 0.2, ease: cubicEasingFn } },
  open: { width: 'var(--workbench-width)', transition: { duration: 0.2, ease: cubicEasingFn } },
} satisfies Variants;

/** Width, in pixels of panel, at which the toolbar fits on one row. */
const WIDE_TOOLBAR = 1040;

const View = memo(({ children, ...props }: HTMLMotionProps<'div'> & { children: JSX.Element }) => (
  <motion.div className="absolute inset-0" transition={{ ease: cubicEasingFn }} {...props}>
    {children}
  </motion.div>
));

View.displayName = 'View';

export const WorkbenchShell = memo(({ chatStarted, isStreaming, setSelectedElement }: WorkbenchShellProps) => {
  /*
   * Keep the derived atom stable. Creating a new `computed` store during every
   * render makes useStore unsubscribe/resubscribe in a loop while preview
   * actions are streaming, which can lock the workbench with React's
   * "Maximum update depth exceeded" warning on lower-end machines.
   */
  const hasPreviewStore = useMemo(() => computed(workbenchStore.previews, (previews) => previews.length > 0), []);
  const hasPreview = useStore(hasPreviewStore);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const streaming = useStore(streamingState);
  const { showChat } = useStore(chatStore);

  const pipeline = useStore(pipelineStore);
  const designSystem = useStore(designSystemStore);
  const designStatus = useStore(designSystemStatusStore);
  const architecture = useStore(architectureStore);
  const designContract = useStore(designContractStore);

  const { exportChat } = useConversationHistory();

  const isSmallViewport = useViewport(768);
  const panelRef = useRef<HTMLDivElement>(null);
  const wideToolbar = useElementWidth(panelRef) >= WIDE_TOOLBAR;

  const [inspector, setInspector] = useState<InspectorPanel>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const canHideChat = showWorkbench || !showChat;

  /** Only one inspector at a time, so the editor keeps the space it needs. */
  const toggleInspector = useCallback(
    (panel: Exclude<InspectorPanel, null>) => setInspector((current) => (current === panel ? null : panel)),
    [],
  );

  const targets = useMemo(() => (architecture ? Object.keys(architecture.stackDecisions) : []), [architecture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (inspector) {
        setInspector(null);
      } else if (showWorkbench) {
        workbenchStore.showWorkbench.set(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspector, showWorkbench]);

  const setView = useCallback((view: WorkbenchViewType) => workbenchStore.currentView.set(view), []);

  // A running preview is the thing worth looking at, so switch to it.
  useEffect(() => {
    if (hasPreview) {
      setView('preview');
    }
  }, [hasPreview, setView]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((path: string | undefined) => workbenchStore.setSelectedFile(path), []);

  const onFileSave = useCallback(() => {
    workbenchStore
      .saveCurrentDocument()
      .then(() => {
        // A saved file should be reflected in what the preview shows.
        workbenchStore.refreshAllPreviews();
      })
      .catch(() => toast.error('That file could not be saved.'));
  }, []);

  /*
   * Project overview, snapshots and pre-flight are three names for the same
   * place in the toolbar: one button that opens the Product panel where the
   * overview already lives, two more buttons that do what those names say.
   * Keeping the actions here means the workbench shell stays composition and
   * none of these grow into a file of their own.
   */
  const preFlightCheck = useCallback(() => {
    import('~/lib/cude/preflight')
      .then(({ preFlight }) => {
        const report = preFlight(files);

        if (report.issues.length === 0) {
          toast.success(
            `Pre-flight: ${report.files} files, ${(report.bytes / 1024).toFixed(1)}KB. Nothing to warn about.`,
          );
        } else {
          const first = report.issues[0].message.slice(0, 160);
          toast[report.issues[0].level === 'warning' ? 'warning' : 'info'](
            `Pre-flight: ${report.files} files — ${first}`,
          );
        }
      })
      .catch(() => toast.error('The pre-flight check could not run.'));
  }, [files]);

  const saveSnapshot = useCallback(() => {
    import('~/lib/cude/snapshots')
      .then(({ saveSnapshot: save }) => {
        const label = window.prompt('Snapshot name', new Date().toLocaleString());

        if (label === null) {
          return;
        }

        save(label, files as unknown as Record<string, unknown>);
        toast.success(`Snapshot "${label || 'untitled'}" saved.`);
      })
      .catch(() => toast.error('The snapshot could not be saved.'));
  }, [files]);

  const onFileReset = useCallback(() => workbenchStore.resetCurrentDocument(), []);

  const openInDiff = useCallback((path: string) => {
    workbenchStore.setSelectedFile(path);
    workbenchStore.currentView.set('diff');
  }, []);

  const syncToDisk = useCallback(async () => {
    setIsSyncing(true);

    try {
      /*
       * A picked folder is remembered both ways: opening a folder ties the
       * project to it, and saving asks once, then goes straight there. Asking
       * on every save is how a synced folder quietly becomes five copies.
       */
      const remembered = getSyncedFolder();

      if (remembered) {
        await workbenchStore.syncFiles(remembered);
        toast.success('Saved to the linked folder.');

        return;
      }

      const picked = await window.showDirectoryPicker();
      await workbenchStore.syncFiles(picked);
      setSyncedFolder(picked);
      toast.success('Files written to that folder. It stays linked for the next save.');
    } catch (error) {
      // An aborted picker is a choice, not a failure.
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('The files could not be written.');
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  /*
   * Built once and rendered in whichever arrangement fits, so the wide and
   * narrow toolbars cannot drift apart.
   */
  const inspectorTabs = (
    <>
      <InspectorTab
        active={inspector === 'agents'}
        onClick={() => toggleInspector('agents')}
        title="Engineering pipeline"
        label="AGENTS"
        wide={wideToolbar}
        badge={pipeline.status !== 'idle' ? PIPELINE_STATUS_BADGE[pipeline.status] : undefined}
      />
      <InspectorTab
        active={inspector === 'design'}
        onClick={() => toggleInspector('design')}
        title="Proposed interface — approve before building"
        label="DESIGN"
        wide={wideToolbar}
        badge={designContract && designContract.status !== 'approved' ? 'REVIEW' : designContract ? 'OK' : undefined}
        dimmed={!designContract}
      />
      <InspectorTab
        active={inspector === 'product'}
        onClick={() => toggleInspector('product')}
        title="Product platforms, and adding one"
        label="PRODUCT"
        wide={wideToolbar}
        badge={architecture ? String(architecture.requirements.targetPlatforms.length) : undefined}
        dimmed={!architecture}
      />
      <InspectorTab
        active={inspector === 'architecture'}
        onClick={() => toggleInspector('architecture')}
        title="Stack decisions per target"
        label="ARCHITECTURE"
        shortLabel="ARCH"
        wide={wideToolbar}
        badge={targets.length > 0 ? String(targets.length) : undefined}
        dimmed={!architecture}
      />
      <InspectorTab
        active={inspector === 'graph'}
        onClick={() => toggleInspector('graph')}
        title="Connected product family"
        label="GRAPH"
        wide={wideToolbar}
        dimmed={!architecture}
      />
      <InspectorTab
        active={inspector === 'theme'}
        onClick={() => toggleInspector('theme')}
        title="Design system and Theme Studio"
        label="THEME"
        wide={wideToolbar}
        dimmed={!designSystem}
      />
      <InspectorTab
        active={inspector === 'history'}
        onClick={() => toggleInspector('history')}
        title="Named snapshots you can restore"
        label="HISTORY"
        shortLabel="HIST"
        wide={wideToolbar}
      />
    </>
  );

  const projectActions = (
    <>
      {selectedView === 'diff' && <ChangedFilesMenu onSelectFile={openInDiff} />}
      <ExportChatButton exportChat={exportChat} />
      <ToolbarAction
        icon={isSyncing ? 'i-ph:spinner animate-spin' : 'i-ph:cloud-arrow-down'}
        label={isSyncing ? 'Syncing' : 'Sync'}
        title={getSyncedFolder() ? 'Save to the linked folder' : 'Write the project files to a folder'}
        disabled={isSyncing || streaming}
        onClick={syncToDisk}
      />
      <ToolbarAction
        icon="i-ph:list-magnifying-glass"
        label="Check"
        title="Pre-flight: count, size and risky strings"
        onClick={preFlightCheck}
      />
      <ToolbarAction
        icon="i-ph:camera"
        label="Snapshot"
        title="Save a named snapshot of the current files"
        onClick={saveSnapshot}
      />
      <ToolbarAction
        icon="i-ph:drop"
        label="Tokens"
        title="Download the design tokens as tokens.css"
        disabled={streaming || !designSystem}
        onClick={() => {
          const system = designSystem;

          if (!system) {
            toast.info('No design system yet — it appears once the designer runs.');
            return;
          }

          const blob = new Blob([designSystemToCssVars(system)], { type: 'text/css' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'tokens.css';
          link.click();
          URL.revokeObjectURL(url);
          toast.success('tokens.css downloaded.');
        }}
      />
      <ToolbarAction
        icon="i-ph:terminal"
        label="Terminal"
        title="Show or hide the terminal"
        active={showTerminal}
        onClick={() => workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get())}
      />
    </>
  );

  const closeButton = (
    <button
      aria-label="Close workspace"
      title="Close workspace"
      onClick={() => workbenchStore.showWorkbench.set(false)}
      className={classNames(
        'shrink-0 w-7 h-7 rounded-md flex items-center justify-center',
        'text-cude-textSecondary hover:text-cude-textPrimary',
        'hover:bg-cude-background-depth-3 transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
      )}
    >
      <span className="i-ph:x text-base" />
    </button>
  );

  if (!chatStarted) {
    return null;
  }

  return (
    <motion.div
      initial="closed"
      animate={showWorkbench ? 'open' : 'closed'}
      variants={PANEL_VARIANTS}
      className="z-workbench shrink-0"
    >
      <div
        className={classNames(
          'fixed top-[calc(var(--header-height)+1.2rem)] bottom-6 w-[var(--workbench-inner-width)] z-0',
          'transition-[left,width] duration-200 cude-ease-cubic-bezier',
          {
            'w-full': isSmallViewport,
            'left-0': showWorkbench && isSmallViewport,
            'left-[var(--workbench-left)]': showWorkbench,
            'left-[100%]': !showWorkbench,
          },
        )}
      >
        <div className="absolute inset-0 px-2 lg:px-4">
          <div
            ref={panelRef}
            className="h-full flex flex-col bg-cude-background-depth-2 border border-cude-borderColor shadow-sm rounded-lg overflow-hidden"
          >
            <div className="border-b border-cude-borderColor">
              <div className="flex items-center h-11 px-2 lg:px-3 gap-1.5 min-w-0">
                {!isSmallViewport && (
                  <button
                    aria-label={showChat ? 'Hide conversation panel' : 'Show conversation panel'}
                    title={showChat ? 'Hide conversation' : 'Show conversation'}
                    disabled={!canHideChat}
                    onClick={() => canHideChat && chatStore.setKey('showChat', !showChat)}
                    className={classNames(
                      'shrink-0 w-7 h-7 rounded-md flex items-center justify-center mr-0.5',
                      'text-cude-textSecondary hover:text-cude-textPrimary',
                      'hover:bg-cude-background-depth-3 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
                    )}
                  >
                    <span
                      className={classNames(showChat ? 'i-ph:sidebar-simple-fill' : 'i-ph:sidebar-simple', 'text-base')}
                    />
                  </button>
                )}

                <div className="shrink-0">
                  <Slider selected={selectedView} options={SLIDER_OPTIONS} setSelected={setView} />
                </div>

                <ToolbarDivider className={wideToolbar ? 'block' : 'hidden'} />

                <div
                  role="tablist"
                  aria-label="Engineering inspectors"
                  className={classNames(
                    'items-center gap-1 overflow-x-auto min-w-0 no-scrollbar',
                    wideToolbar ? 'flex' : 'hidden',
                  )}
                >
                  {inspectorTabs}
                </div>

                <div className="ml-auto" />

                <div className={classNames('items-center gap-1 shrink-0', wideToolbar ? 'flex' : 'hidden')}>
                  {projectActions}
                  <ToolbarDivider />
                  {closeButton}
                </div>

                <div className={classNames('shrink-0', wideToolbar ? 'hidden' : 'block')}>{closeButton}</div>
              </div>

              {/*
               * Narrow panels get a second row carrying the inspectors and the
               * project actions, so nothing is compressed into an unreadable
               * sliver or dropped without an affordance.
               */}
              <div
                role="tablist"
                aria-label="Engineering inspectors"
                className={classNames(
                  'flex-wrap items-center gap-1 px-2 pb-2 [&>*]:shrink-0',
                  wideToolbar ? 'hidden' : 'flex',
                )}
              >
                {inspectorTabs}
                {projectActions}
              </div>

              <EngineeringStatusStrip
                pipeline={pipeline}
                targets={targets}
                designStatus={designSystem ? designStatus : null}
                filesCount={Object.keys(files).length}
              />
            </div>

            {inspector && (
              <div
                className={classNames(
                  'border-b border-cude-borderColor bg-cude-background-depth-1 p-3',
                  'overflow-auto modern-scrollbar',

                  /*
                   * On a phone the chosen tool takes the workspace. On a desktop
                   * it shares space with the editor — except Design Review,
                   * which is a decision and needs the proposal at real size.
                   */
                  isSmallViewport ? 'flex-1 min-h-0' : inspector === 'design' ? 'max-h-[74%]' : 'max-h-[48%]',
                )}
              >
                <div className="mb-3 flex items-center justify-between border-b border-cude-borderColor pb-2">
                  <span className="text-[10px] font-semibold tracking-widest text-cude-textTertiary">
                    {inspector === 'architecture'
                      ? 'ARCHITECTURE'
                      : inspector === 'graph'
                        ? 'PRODUCT GRAPH'
                        : inspector === 'history'
                          ? 'HISTORY'
                          : 'INSPECTOR'}
                  </span>
                  <button
                    type="button"
                    aria-label="Close inspector"
                    title="Close inspector"
                    onClick={() => setInspector(null)}
                    className="rounded-md px-2 py-1 text-[11px] text-cude-textTertiary hover:bg-cude-background-depth-2 hover:text-cude-textPrimary"
                  >
                    Close
                  </button>
                </div>
                {inspector === 'agents' && (
                  <AgentTimeline
                    agents={pipeline.agents}
                    status={pipeline.status}
                    repairAttempts={pipeline.repairAttempts}
                    maxRepairAttempts={pipeline.maxRepairAttempts}
                    lastError={pipeline.lastError}
                    targets={targets}
                  />
                )}
                {inspector === 'design' && <DesignReviewPanel />}
                {inspector === 'product' && <AddPlatformPanel />}
                {inspector === 'architecture' && <ArchitectureDecisionPanel />}
                {inspector === 'graph' && <ProductGraphPanel />}
                {inspector === 'theme' && <ThemeStudio />}
                {inspector === 'history' && <SnapshotsPanel />}
              </div>
            )}

            <div className="relative flex-1 overflow-hidden">
              <View initial={{ x: '0%' }} animate={{ x: selectedView === 'code' ? '0%' : '-100%' }}>
                <EditorPanel
                  editorDocument={currentDocument}
                  isStreaming={isStreaming}
                  selectedFile={selectedFile}
                  files={files}
                  unsavedFiles={unsavedFiles}
                  onFileSelect={onFileSelect}
                  onEditorScroll={onEditorScroll}
                  onEditorChange={onEditorChange}
                  onFileSave={onFileSave}
                  onFileReset={onFileReset}
                />
              </View>

              <View
                initial={{ x: '100%' }}
                animate={{ x: selectedView === 'diff' ? '0%' : selectedView === 'code' ? '100%' : '-100%' }}
              >
                <DiffSurface />
              </View>

              <View initial={{ x: '100%' }} animate={{ x: selectedView === 'preview' ? '0%' : '100%' }}>
                <PreviewSurface setSelectedElement={setSelectedElement} />
              </View>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

WorkbenchShell.displayName = 'WorkbenchShell';

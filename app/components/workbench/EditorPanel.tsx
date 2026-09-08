// Cude.new - EditorPanel.tsx (Cude product surface, 2026)
import { useStore } from '@nanostores/react';
import { memo, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import * as Tabs from '@radix-ui/react-tabs';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { FileMap } from '~/lib/cude/state/workspace';
import { themeStore } from '~/lib/stores/theme';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import useViewport from '~/lib/hooks';
import { isMobile } from '~/utils/mobile';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTreeSurface } from '~/components/cude/workbench/FileTreeSurface';
import { DEFAULT_TERMINAL_SIZE, TerminalTabs } from './terminal/TerminalTabs';
import { workbenchStore } from '~/lib/stores/workbench';
import { Search } from './Search'; // <-- Ensure Search is imported
import { WorkspacePlaceholder } from '~/components/cude/WorkspacePlaceholder';
import { classNames } from '~/utils/classNames'; // <-- Import classNames if not already present
import { LockManager } from './LockManager'; // <-- Import LockManager

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    /** Distinguishes "nothing generated yet" from "nothing selected yet". */
    const filesCount = files ? Object.keys(files).length : 0;

    /*
     * Which files this build has touched. The tree marks them so a long
     * generation is legible without opening each one.
     */
    const changedFiles = useStore(workbenchStore.changedByBuild);

    const isSmallViewport = useViewport(1024);

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      if (!editorDocument || !unsavedFiles) {
        return false;
      }

      // Make sure unsavedFiles is a Set before calling has()
      return unsavedFiles instanceof Set && unsavedFiles.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            {/*
             * The tree needs a larger share of a narrow viewport, otherwise its
             * own tab labels clip at phone widths.
             */}
            <Panel
              defaultSize={isSmallViewport ? 38 : 20}
              minSize={isSmallViewport ? 25 : 15}
              collapsible
              className="border-r border-cude-borderColor"
            >
              <div className="h-full">
                <Tabs.Root defaultValue="files" className="flex flex-col h-full">
                  <PanelHeader className="w-full text-sm font-medium text-cude-textSecondary px-1">
                    <div className="h-full flex-shrink-0 flex items-center justify-between w-full">
                      <Tabs.List className="h-full flex-shrink-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                        <Tabs.Trigger
                          value="files"
                          title="Files"
                          aria-label="Files"
                          className={classNames(
                            'h-full bg-transparent hover:bg-cude-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium',
                            'text-cude-textTertiary hover:text-cude-textPrimary data-[state=active]:text-cude-textPrimary',
                            'flex items-center gap-1.5 shrink-0',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
                          )}
                        >
                          <span className="i-ph:tree-structure text-base" aria-hidden="true" />
                          <span className="hidden sm:inline">Files</span>
                        </Tabs.Trigger>
                        <Tabs.Trigger
                          value="search"
                          title="Search"
                          aria-label="Search"
                          className={classNames(
                            'h-full bg-transparent hover:bg-cude-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium',
                            'text-cude-textTertiary hover:text-cude-textPrimary data-[state=active]:text-cude-textPrimary',
                            'flex items-center gap-1.5 shrink-0',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
                          )}
                        >
                          <span className="i-ph:magnifying-glass text-base" aria-hidden="true" />
                          <span className="hidden sm:inline">Search</span>
                        </Tabs.Trigger>
                        <Tabs.Trigger
                          value="locks"
                          title="Locks"
                          aria-label="Locks"
                          className={classNames(
                            'h-full bg-transparent hover:bg-cude-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium',
                            'text-cude-textTertiary hover:text-cude-textPrimary data-[state=active]:text-cude-textPrimary',
                            'flex items-center gap-1.5 shrink-0',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
                          )}
                        >
                          <span className="i-ph:lock-simple text-base" aria-hidden="true" />
                          <span className="hidden sm:inline">Locks</span>
                        </Tabs.Trigger>
                      </Tabs.List>
                    </div>
                  </PanelHeader>

                  <Tabs.Content value="files" className="flex-grow overflow-auto focus-visible:outline-none">
                    <FileTreeSurface
                      className="h-full"
                      files={files}
                      hideRoot
                      unsavedFiles={unsavedFiles}
                      changedFiles={changedFiles}
                      rootFolder={WORK_DIR}
                      selectedFile={selectedFile}
                      onFileSelect={onFileSelect}
                    />
                  </Tabs.Content>

                  <Tabs.Content value="search" className="flex-grow overflow-auto focus-visible:outline-none">
                    <Search />
                  </Tabs.Content>

                  <Tabs.Content value="locks" className="flex-grow overflow-auto focus-visible:outline-none">
                    <LockManager />
                  </Tabs.Content>
                </Tabs.Root>
              </div>
            </Panel>

            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                    {activeFileUnsaved && (
                      <div className="flex gap-1 ml-auto -mr-1.5">
                        <PanelHeaderButton onClick={onFileSave}>
                          <div className="i-ph:floppy-disk-duotone" />
                          Save
                        </PanelHeaderButton>
                        <PanelHeaderButton onClick={onFileReset}>
                          <div className="i-ph:clock-counter-clockwise-duotone" />
                          Reset
                        </PanelHeaderButton>
                      </div>
                    )}
                  </div>
                )}
              </PanelHeader>
              <div className="h-full flex-1 overflow-hidden modern-scrollbar">
                {editorDocument === undefined ? (
                  <WorkspacePlaceholder hasFiles={filesCount > 0} />
                ) : (
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={editorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={onEditorChange}
                    onSave={onFileSave}
                  />
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <TerminalTabs />
      </PanelGroup>
    );
  },
);

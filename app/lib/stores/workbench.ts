// Cude.new - workbench.ts (Cude product surface, 2026)
import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { CudeActionRunner } from '~/lib/cude/pipeline/actionRunnerAdapter';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/cude/pipeline/artifactParser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { EditorStore } from './editor';
import { WorkspaceService } from '~/lib/cude/state/workspace';
import type { FileMap } from '~/lib/cude/state/workspace';
import { MemoryRuntime } from '~/lib/cude/runtime/memoryRuntime';
import { getAppRuntime } from '~/lib/cude/runtime/appRuntime';
import { PreviewService } from '~/lib/cude/state/workspace/previewService';
import type { CommandResult } from '~/lib/cude/runtime/types';
import { TerminalService } from '~/lib/cude/state/workspace/terminalService';
import { path } from '~/utils/path';
import { cudeEventLog } from '~/lib/cude/state/eventLog';
import { downloadProject, writeProjectToDirectory } from '~/lib/cude/state/workspaceExport';
import { conversationDescription as description } from '~/lib/cude/state/useConversationHistory';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: CudeActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'diff' | 'preview';

export class WorkbenchStore {
  #previews = new PreviewService();

  /*
   * The workspace starts on the in-memory runtime and is upgraded to the real
   * one once it exists. That keeps construction synchronous — the workbench is
   * built during module evaluation — without booting a container on import.
   */
  #workspace = new WorkspaceService(new MemoryRuntime());
  #editorStore = new EditorStore(this.#workspace);
  #terminals = new TerminalService();

  #reloadedMessages = new Set<string>();

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> =
    import.meta.hot?.data.actionAlert ?? atom<ActionAlert | undefined>(undefined);
  supabaseAlert: WritableAtom<SupabaseAlert | undefined> =
    import.meta.hot?.data.supabaseAlert ?? atom<SupabaseAlert | undefined>(undefined);
  deployAlert: WritableAtom<DeployAlert | undefined> =
    import.meta.hot?.data.deployAlert ?? atom<DeployAlert | undefined>(undefined);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #globalExecutionQueue = Promise.resolve();

  /**
   * Resolves once the workspace has a runtime to act on.
   *
   * Booting a container takes seconds, and the workbench is constructed
   * synchronously while the module is evaluated — so a message sent as soon as
   * the page is usable reached the executor first. Nothing waited for this: it
   * was started and dropped, and the actions ran against a workspace with
   * nothing behind it, failing with "Cude runtime used before
   * initializeWorkspace()". Intermittently, which is why it looked like
   * something else — on a second visit the container was already up.
   */
  #runtimeReady: Promise<void>;
  #runtimeError: Error | null = null;

  constructor() {
    /*
     * Upgrade the workspace onto the real runtime as soon as one exists. The
     * workbench itself is constructed synchronously during module evaluation.
     */
    this.#runtimeReady = getAppRuntime()
      .then((runtime) => {
        this.#terminals.attachRuntime(runtime);
        this.#previews.attachRuntime(runtime);

        return this.#workspace.attachRuntime(runtime);
      })
      .catch((error) => {
        /*
         * A workspace that could not be attached is reported once, here. The
         * actions that follow will fail with their own messages, and those name
         * the command; this names the cause.
         */
        cudeEventLog.error('workspace', 'Could not attach the workspace runtime', error);
        this.#runtimeError = error instanceof Error ? error : new Error(String(error));
        this.actionAlert.set({
          type: 'error',
          title: 'Workspace unavailable',
          description: this.#runtimeError.message,
          content: '',
          source: 'terminal',
        });
      });

    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.actionAlert = this.actionAlert;
      import.meta.hot.data.supabaseAlert = this.supabaseAlert;
      import.meta.hot.data.deployAlert = this.deployAlert;

      // Ensure binary files are properly preserved across hot reloads
      const filesMap = this.files.get();

      for (const [path, dirent] of Object.entries(filesMap)) {
        if (dirent?.type === 'file' && dirent.isBinary && dirent.content) {
          // Make sure binary content is preserved
          this.files.setKey(path, { ...dirent });
        }
      }
    }
  }

  /** Resolves when the workspace can be written to. */
  get runtimeReady(): Promise<void> {
    return this.#runtimeReady;
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    /*
     * Every action waits for the runtime, not just the first. Awaiting an
     * already-resolved promise costs a microtask, and the alternative is a
     * generated project that silently goes nowhere when someone types their
     * first message quickly.
     */
    this.#globalExecutionQueue = this.#globalExecutionQueue
      .then(() => this.#runtimeReady)
      .then(() => {
        if (this.#runtimeError) {
          throw this.#runtimeError;
        }

        return callback();
      })
      .catch((error) => {
        this.actionAlert.set({
          type: 'error',
          title: 'Workspace action failed',
          description: error instanceof Error ? error.message : String(error),
          content: '',
          source: 'terminal',
        });
      });
  }

  get previews() {
    return this.#previews.previews;
  }

  /** Reload every preview, e.g. after a file save. */
  refreshAllPreviews() {
    this.#previews.refreshAll();
  }

  /** Reload one preview by port. */
  refreshPreview(port: number) {
    return this.#previews.refresh(port);
  }

  get files() {
    return this.#workspace.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#workspace.fileCount;
  }

  get showTerminal() {
    return this.#terminals.visible;
  }

  /** The shell the pipeline runs commands in. */
  get commandShell() {
    return this.#terminals.commandShellHandle();
  }
  get alert() {
    return this.actionAlert;
  }
  clearAlert() {
    this.actionAlert.set(undefined);
  }

  clearSupabaseAlert() {
    this.supabaseAlert.set(undefined);
  }

  clearDeployAlert() {
    this.deployAlert.set(undefined);
  }

  toggleTerminal(value?: boolean) {
    this.#terminals.toggle(value);
  }

  /**
   * Runs one command in the workspace shell and reports the result.
   *
   * The only way UI code should execute commands: it goes through the same
   * shell the pipeline uses, with the same timeouts, and a missing runtime
   * comes back as a result rather than a throw.
   */
  runCommand(command: string, options?: { timeoutMs?: number }): Promise<CommandResult> {
    return this.#terminals.execute(command, options);
  }

  attachTerminal(terminal: ITerminal) {
    void this.#terminals.attach(terminal);
  }
  attachCudeTerminal(terminal: ITerminal) {
    void this.#terminals.openCommandShell(terminal);
  }

  detachTerminal(terminal: ITerminal) {
    void this.#terminals.detach(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminals.resize({ cols, rows });
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#workspace.fileCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  /** Replace the running project from a user snapshot, then refresh the editor and previews. */
  async restoreDocuments(files: FileMap): Promise<void> {
    await this.#runtimeReady;

    if (this.#runtimeError) {
      throw this.#runtimeError;
    }

    const project = Object.entries(files)
      .filter((entry): entry is [string, NonNullable<FileMap[string]>] => entry[1]?.type === 'file')
      .map(([filePath, file]) => ({ path: filePath, contents: file.type === 'file' ? file.content : '' }));

    await this.#workspace.mount(project);
    this.#editorStore.setDocuments(this.#workspace.files.get());
    this.#workspace.beginBuild();
    this.refreshAllPreviews();
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#workspace.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    /*
     * For scoped locks, we would need to implement diff checking here
     * to determine if the user is modifying existing code or just adding new code
     * This is a more complex feature that would be implemented in a future update
     */

    await this.#workspace.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#workspace.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  /** Paths the current build has changed. */
  get changedByBuild() {
    return this.#workspace.changedByBuild;
  }

  /** What a file held when the build began. */
  baselineFor(path: string) {
    return this.#workspace.baselineFor(path);
  }

  getFileModifications() {
    return this.#workspace.fileModifications();
  }

  getModifiedFiles() {
    return this.#workspace.modifiedFiles();
  }

  resetAllFileModifications() {
    this.#workspace.resetModifications();
  }

  /**
   * Lock a file to prevent edits
   * @param filePath Path to the file to lock
   * @returns True if the file was successfully locked
   */
  lockFile(filePath: string) {
    return this.#workspace.lock(filePath);
  }

  /**
   * Lock a folder and all its contents to prevent edits
   * @param folderPath Path to the folder to lock
   * @returns True if the folder was successfully locked
   */
  lockFolder(folderPath: string) {
    return this.#workspace.lock(folderPath);
  }

  /**
   * Unlock a file to allow edits
   * @param filePath Path to the file to unlock
   * @returns True if the file was successfully unlocked
   */
  unlockFile(filePath: string) {
    return this.#workspace.unlock(filePath);
  }

  /**
   * Unlock a folder and all its contents to allow edits
   * @param folderPath Path to the folder to unlock
   * @returns True if the folder was successfully unlocked
   */
  unlockFolder(folderPath: string) {
    return this.#workspace.unlock(folderPath);
  }

  /**
   * Check if a file is locked
   * @param filePath Path to the file to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFileLocked(filePath: string) {
    return this.#workspace.isLocked(filePath);
  }

  /**
   * Check if a folder is locked
   * @param folderPath Path to the folder to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFolderLocked(folderPath: string) {
    return this.#workspace.isLocked(folderPath);
  }

  async createFile(filePath: string, content: string | Uint8Array = ''): Promise<boolean> {
    const created = await this.#workspace.createFile(filePath, content);

    if (created) {
      this.setSelectedFile(filePath);

      /*
       * A file created empty has nothing unsaved in it. Without this it opens
       * already marked as modified, which is a lie the user has to dismiss.
       */
      if (content === '') {
        this.#forgetUnsaved((path) => path === filePath);
      }
    }

    return Boolean(created);
  }

  async createFolder(folderPath: string): Promise<boolean> {
    this.#workspace.createFolder(folderPath);

    return true;
  }

  /** Picks something to show after the open file goes away. */
  #selectAnotherFile(): void {
    const next = Object.entries(this.files.get()).find(([, entry]) => entry?.type === 'file')?.[0];
    this.setSelectedFile(next);
  }

  /** Forgets unsaved marks for paths that no longer exist. */
  #forgetUnsaved(matches: (path: string) => boolean): void {
    const unsaved = this.unsavedFiles.get();
    const remaining = new Set([...unsaved].filter((path) => !matches(path)));

    if (remaining.size !== unsaved.size) {
      this.unsavedFiles.set(remaining);
    }
  }

  async deleteFile(filePath: string): Promise<boolean> {
    const wasOpen = this.currentDocument.get()?.filePath === filePath;
    const removed = await this.#workspace.remove(filePath);

    if (removed) {
      this.#forgetUnsaved((path) => path === filePath);

      if (wasOpen) {
        this.#selectAnotherFile();
      }
    }

    return Boolean(removed);
  }

  async deleteFolder(folderPath: string): Promise<boolean> {
    const prefix = `${folderPath}/`;
    const wasInside = this.currentDocument.get()?.filePath?.startsWith(prefix) ?? false;
    const removed = await this.#workspace.remove(folderPath);

    if (removed) {
      this.#forgetUnsaved((path) => path.startsWith(prefix));

      if (wasInside) {
        this.#selectAnotherFile();
      }
    }

    return Boolean(removed);
  }

  abortAllActions() {
    for (const artifact of Object.values(this.artifacts.get())) {
      artifact.runner.abort();
    }
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    /*
     * The first artifact of a response is where a build starts. Snapshot the
     * workspace here so the diff surface can say what this build changed,
     * rather than accumulating that as a side effect of rendering a diff.
     */
    if (this.artifactIdList.length === 0) {
      this.#workspace.beginBuild();
    }

    const key = this.artifactKey(messageId, id);
    const artifact = this.#getArtifact(key);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(key)) {
      this.artifactIdList.push(key);
    }

    this.artifacts.setKey(key, {
      id,
      title,
      closed: false,
      type,
      runner: new CudeActionRunner({
        workspace: this.#workspace,
        terminals: this.#terminals,
        onAlert: (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
        onDeployAlert: (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.deployAlert.set(alert);
        },
      }),
    });
  }

  updateArtifact({ messageId, artifactId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    if (!artifactId) {
      return;
    }

    const key = this.artifactKey(messageId, artifactId);
    const artifact = this.#getArtifact(key);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(key, { ...artifact, ...state });
  }
  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const { messageId, artifactId } = data;

    const artifact = this.#getArtifact(this.artifactKey(messageId, artifactId));

    if (!artifact) {
      unreachable('Artifact not found');
    }

    return artifact.runner.addAction(data);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }
  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { messageId, artifactId } = data;

    const artifact = this.#getArtifact(this.artifactKey(messageId, artifactId));

    if (!artifact) {
      unreachable('Artifact not found');
    }

    const action = artifact.runner.actions.get()[data.actionId];

    // The executor refuses to re-run anything past pending; this avoids the work.
    if (!action || action.status !== 'pending') {
      return;
    }

    if (data.action.type === 'file') {
      const wc = await webcontainer;
      const fullPath = path.join(wc.workdir, data.action.filePath);

      /*
       * For scoped locks, we would need to implement diff checking here
       * to determine if the AI is modifying existing code or just adding new code
       * This is a more complex feature that would be implemented in a future update
       */

      if (this.selectedFile.value !== fullPath) {
        this.setSelectedFile(fullPath);
      }

      if (this.currentView.value !== 'code') {
        this.currentView.set('code');
      }

      const doc = this.#editorStore.documents.get()[fullPath];

      if (!doc) {
        await artifact.runner.runAction(data, isStreaming);
      }

      this.#editorStore.updateFile(fullPath, data.action.content);

      if (!isStreaming && data.action.content) {
        await this.saveFile(fullPath);
      }

      if (!isStreaming) {
        await artifact.runner.runAction(data);
        this.resetAllFileModifications();
        this.#refreshPreviewsSoon();
      }
    } else {
      await artifact.runner.runAction(data);
    }
  }

  /** Coalesces a burst of file writes into one preview reload. */
  #previewRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Reload the preview once the Builder has stopped writing.
   *
   * Nothing did this. A refresh was only ever triggered by someone saving a
   * file in the editor by hand, so a change Cude itself wrote left the preview
   * on the old page: a person asked for a longer timer, Cude wrote it, the
   * server was serving it, and the screen still said 25:00 with nothing to say
   * why.
   *
   * Debounced, because a project arrives as a burst of files and reloading
   * between each one would show a page with half its assets.
   */
  #refreshPreviewsSoon() {
    if (this.#previewRefreshTimer) {
      clearTimeout(this.#previewRefreshTimer);
    }

    this.#previewRefreshTimer = setTimeout(() => {
      this.#previewRefreshTimer = null;
      this.refreshAllPreviews();
    }, 400);
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    /*
     * The streaming path does not go through the queue, so it waits here for
     * itself. Without this, the first chunk of the first file of a first
     * message raced the container boot and was written to a workspace that had
     * no runtime yet.
     */
    await this.#runtimeReady;

    return await this._runAction(data, isStreaming);
  }, 100); // TODO: remove this magic number to have it configurable

  /**
   * The key an artifact is stored under.
   *
   * Message and id together, because the id belongs to the model and it
   * reuses it. Asked to change the timer it had just built, it opened a second
   * artifact called `pomodoro-timer` — the same name as the first. Keyed on
   * that alone, `addArtifact` found one already there and returned, so the new
   * actions were queued onto the finished runner from the previous turn, where
   * action "0" was already complete and every write was skipped as a re-run.
   *
   * The visible result was a reply describing the change in detail, a green
   * tick, and a file nobody had touched.
   */
  artifactKey(messageId: string, id: string): string {
    /*
     * Length-prefixed, so the two halves cannot be read apart differently.
     * An id comes from the model, and `a::b` + `c` would otherwise land on the
     * same key as `a` + `b::c`.
     */
    return `${messageId.length}:${messageId}::${id}`;
  }

  /** The artifact one message opened, by the id that message gave it. */
  artifactFor(messageId: string, id: string) {
    return this.#getArtifact(this.artifactKey(messageId, id));
  }

  #getArtifact(key: string) {
    const artifacts = this.artifacts.get();
    return artifacts[key];
  }

  /** Downloads the project as a zip. Returns the filename it used. */
  async downloadZip(): Promise<string> {
    return downloadProject(this.files.get(), description.value ?? undefined);
  }

  /** Writes the project into a folder. Returns the paths written. */
  async syncFiles(targetHandle: FileSystemDirectoryHandle): Promise<string[]> {
    return writeProjectToDirectory(this.files.get(), targetHandle);
  }
}

export const workbenchStore = new WorkbenchStore();

// Legacy alias

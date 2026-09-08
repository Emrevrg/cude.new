// Cude.new - OpenFolderButton.tsx (Cude product surface, 2026)
import React, { useState } from 'react';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { MAX_FILES, isBinaryFile, shouldIncludeFile } from '~/utils/fileUtils';
import { buildFolderMessages } from '~/utils/folderImport';
import { setSyncedFolder } from '~/lib/cude/folderSync';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';

interface OpenFolderButtonProps {
  className?: string;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
}

/** Folders that are never worth reading: build output and dependency trees. */
const PRUNE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '__pycache__']);
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

interface PickedFile {
  file: File;
  path: string;
}

async function readDirectory(handle: FileSystemDirectoryHandle, prefix: string, out: PickedFile[]): Promise<void> {
  // FileSystemDirectoryHandle.values() is async-iterable in supporting browsers.
  for await (const entry of handle as unknown as AsyncIterable<FileSystemHandle> as any) {
    if (out.length > MAX_FILES) {
      return;
    }

    const name = (entry as { name?: string }).name ?? '';

    if (!name) {
      continue;
    }

    if ((entry as { kind?: string }).kind === 'directory') {
      if (PRUNE_DIRS.has(name)) {
        continue;
      }

      await readDirectory(entry as unknown as FileSystemDirectoryHandle, `${prefix}${name}/`, out);

      if (out.length > MAX_FILES) {
        return;
      }
    } else {
      const file = await (entry as unknown as FileSystemFileHandle).getFile();
      const path = `${prefix}${name}`;

      if (shouldIncludeFile(path)) {
        out.push({ file, path });
      }
    }
  }
}

/**
 * Opens a folder from disk and continues the project here.
 *
 * Import Folder takes a one-shot snapshot through a file input. This opens the
 * real directory through the File System Access API instead, so an existing
 * project on disk — with its folder name intact — lands in the chat as files
 * the team can keep building on. Where the API does not exist the button says
 * so and points at Import Folder rather than failing silently.
 */
export const OpenFolderButton: React.FC<OpenFolderButtonProps> = ({ className, importChat }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleOpen = async () => {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast.error('This browser cannot open folders directly. Use Import Folder instead.');

      return;
    }

    let dir: FileSystemDirectoryHandle;

    try {
      dir = await window.showDirectoryPicker();
    } catch (error) {
      // An aborted picker is a choice, not a failure.
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('The folder could not be opened.');
      }

      return;
    }

    const folderName = dir.name || 'Unknown Folder';
    setIsLoading(true);

    const loadingToast = toast.loading(`Reading ${folderName}...`);

    try {
      const picked: PickedFile[] = [];
      await readDirectory(dir, '', picked);

      if (picked.length === 0) {
        toast.error('No readable files found in the selected folder');

        return;
      }

      if (picked.length > MAX_FILES) {
        toast.error(
          `This folder contains ${picked.length.toLocaleString()} files. This product is not yet optimized for very large projects. Please select a folder with fewer than ${MAX_FILES.toLocaleString()} files.`,
        );

        return;
      }

      const fileChecks = await Promise.all(
        picked.map(async (entry) => ({ ...entry, isBinary: await isBinaryFile(entry.file) })),
      );

      const textEntries = fileChecks.filter((entry) => !entry.isBinary);
      const binaryPaths = fileChecks.filter((entry) => entry.isBinary).map((entry) => entry.path);
      const textBytes = textEntries.reduce((total, entry) => total + entry.file.size, 0);

      if (textEntries.length === 0) {
        toast.error('No text files found in the selected folder');

        return;
      }

      if (textBytes > MAX_IMPORT_BYTES) {
        toast.error(
          `This folder contains ${(textBytes / 1024 / 1024).toFixed(1)}MB of text. Select a project under ${MAX_IMPORT_BYTES / 1024 / 1024}MB so it stays responsive.`,
        );

        return;
      }

      if (binaryPaths.length > 0) {
        toast.info(`Skipping ${binaryPaths.length} binary files`);
      }

      const contents: Array<{ path: string; content: string }> = [];

      for (const entry of textEntries) {
        contents.push({ path: entry.path, content: await entry.file.text() });
      }

      const messages = await buildFolderMessages(contents, binaryPaths, folderName);

      if (importChat) {
        await importChat(folderName, [...messages]);
      }

      /*
       * Tie the project to this folder: the workbench Sync button saves
       * straight back here instead of asking again.
       */
      setSyncedFolder(dir);

      logStore.logSystem('Folder opened for continued work', {
        folderName,
        textFileCount: textEntries.length,
        binaryFileCount: binaryPaths.length,
      });
      toast.success(`"${folderName}" is ready — describe what to do next`);
    } catch (error) {
      logStore.logError('Failed to open folder', error, { folderName });
      console.error('Failed to open folder:', error);
      toast.error('Failed to open folder');
    } finally {
      setIsLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  return (
    <Button
      onClick={handleOpen}
      title="Open a folder from disk and continue working on it"
      variant="default"
      size="lg"
      className={classNames(
        'gap-2 bg-cude-background-depth-1',
        'text-cude-textPrimary',
        'hover:bg-cude-background-depth-2',
        'border border-cude-borderColor',
        'h-10 px-4 py-2 min-w-[120px] justify-center',
        'transition-all duration-200 ease-in-out',
        className,
      )}
      disabled={isLoading}
    >
      <span className="i-ph:folder-open w-4 h-4" />
      {isLoading ? 'Reading...' : 'Open Folder'}
    </Button>
  );
};

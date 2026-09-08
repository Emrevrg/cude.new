/**
 * Cude.new - getting the project out of the workspace.
 *
 * Two ways out: a zip to download, or a folder on disk to write into. Both walk
 * the same file map and both have to answer the same questions — what counts as
 * an exportable file, what the archive is called, and where each file goes
 * inside it.
 *
 * Those answers are pure functions, so they are here and under test rather than
 * inlined twice in a store method.
 */

import fileSaver from 'file-saver';
import type { FileMap } from './workspace';
import { extractRelativePath } from '~/utils/diff';

const { saveAs } = fileSaver;

export interface ExportableFile {
  /** Path relative to the project root. */
  path: string;
  content: string;
}

/**
 * Files that belong in an export.
 *
 * Binary entries are skipped: the workspace holds them as text it could not
 * decode, and writing that back out produces a corrupt file. Folders have no
 * content of their own — the paths recreate them.
 */
export function collectExportableFiles(files: FileMap): ExportableFile[] {
  const out: ExportableFile[] = [];

  for (const [fullPath, entry] of Object.entries(files)) {
    if (entry?.type !== 'file' || entry.isBinary) {
      continue;
    }

    const path = extractRelativePath(fullPath);

    if (path) {
      out.push({ path, content: entry.content });
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Turns a project title into something safe to use as a filename. */
export function slugForArchive(description: string | undefined): string {
  const slug = (description ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || 'project';
}

/**
 * Name for a downloaded archive.
 *
 * Stamped, so exporting the same project twice does not silently overwrite the
 * first download.
 */
export function archiveName(description: string | undefined, at: Date = new Date()): string {
  return `${slugForArchive(description)}-${at.toISOString().slice(0, 10)}-${at.getTime().toString(36).slice(-4)}.zip`;
}

/**
 * Builds the zip. Folders come from the paths, not from separate entries.
 *
 * The zip library is fetched here rather than imported at the top of the file:
 * it is a few hundred kilobytes, this store is loaded on every page, and
 * exporting is something a person does deliberately and rarely.
 */
export async function buildArchive(files: ExportableFile[]): Promise<Blob> {
  const jszip = await import('jszip');
  const zip = new jszip.default();

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  return zip.generateAsync({ type: 'blob' });
}

/** Downloads the project as a zip, and returns the filename it used. */
export async function downloadProject(files: FileMap, description?: string): Promise<string> {
  const exportable = collectExportableFiles(files);
  const name = archiveName(description);

  saveAs(await buildArchive(exportable), name);

  return name;
}

/**
 * Writes the project into a folder the user picked.
 *
 * Returns the paths written, so a caller can report a number rather than a
 * vague success.
 */
export async function writeProjectToDirectory(files: FileMap, target: FileSystemDirectoryHandle): Promise<string[]> {
  const written: string[] = [];

  for (const file of collectExportableFiles(files)) {
    const segments = file.path.split('/');
    let directory = target;

    for (const segment of segments.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }

    const handle = await directory.getFileHandle(segments[segments.length - 1], { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.content);
    await writable.close();

    written.push(file.path);
  }

  return written;
}

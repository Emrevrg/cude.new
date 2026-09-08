import type { FileMap } from './state/workspace';
import { WORK_DIR } from './constants';
export interface PreviewTarget {
  label: string;
  path: string;
}
export function extensionTargets(files: FileMap): PreviewTarget[] {
  const targets: PreviewTarget[] = [];

  for (const [name, file] of Object.entries(files)) {
    if (!name.endsWith('/manifest.json') || file?.type !== 'file') {
      continue;
    }

    try {
      const manifest = JSON.parse(file.content);

      if (!manifest.manifest_version) {
        continue;
      }

      const pages = {
        Popup: manifest.action?.default_popup ?? manifest.browser_action?.default_popup,
        Options: manifest.options_ui?.page ?? manifest.options_page,
        'Side panel': manifest.side_panel?.default_path,
      };
      const manifestDir = name.slice(0, name.lastIndexOf('/'));
      const previewDir =
        manifestDir === WORK_DIR
          ? ''
          : manifestDir.startsWith(`${WORK_DIR}/`)
            ? manifestDir.slice(WORK_DIR.length + 1)
            : manifestDir.replace(/^\//, '');

      for (const [label, page] of Object.entries(pages)) {
        if (typeof page === 'string' && page && !page.includes('..') && !/^[a-z]+:/i.test(page)) {
          targets.push({
            label,
            path: `/${[previewDir, page.replace(/^\//, '')].filter(Boolean).join('/')}`,
          });
        }
      }
    } catch {
      /* A manifest may be incomplete while it streams. */
    }
  }

  return targets;
}

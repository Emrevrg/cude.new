import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import JSZip from 'jszip';
import { workspacePath } from '~/lib/cude/native/workspace';

const MAX_ARCHIVE_BYTES = 20_000_000;
const MAX_FILES = 80;
const MAX_FILE_BYTES = 750_000;
const MAX_TOTAL_BYTES = 5_000_000;
const SKIPPED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body: unknown = await request.json();
    const repoUrl = isRecord(body) && typeof body.repoUrl === 'string' ? body.repoUrl : '';
    const repository = parseGitHubRepository(repoUrl);
    const archiveResponse = await fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.name}/zipball/${encodeURIComponent(repository.ref)}`,
      {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'Cude.new native importer' },
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!archiveResponse.ok) {
      throw new Error(
        archiveResponse.status === 404
          ? 'Repository or revision was not found. Public GitHub repositories are supported.'
          : `GitHub returned ${archiveResponse.status}. Try again later.`,
      );
    }

    const declaredLength = Number(archiveResponse.headers.get('content-length') ?? 0);

    if (declaredLength > MAX_ARCHIVE_BYTES) {
      throw new Error('Repository archive is larger than the 20 MB import limit.');
    }

    const archive = await archiveResponse.arrayBuffer();

    if (archive.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error('Repository archive is larger than the 20 MB import limit.');
    }

    const zip = await JSZip.loadAsync(archive);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const root = commonArchiveRoot(entries.map((entry) => entry.name));
    const files: { path: string; content: string }[] = [];
    let totalBytes = 0;

    for (const entry of entries) {
      const candidate = entry.name.slice(root.length);

      if (!candidate || candidate.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))) {
        continue;
      }

      const path = workspacePath(candidate);
      const bytes = await entry.async('uint8array');

      if (bytes.byteLength > MAX_FILE_BYTES || looksBinary(bytes)) {
        continue;
      }

      totalBytes += bytes.byteLength;

      if (totalBytes > MAX_TOTAL_BYTES || files.length >= MAX_FILES) {
        throw new Error('Repository exceeds the native import limit of 80 text files or 5 MB of text.');
      }

      files.push({ path, content: new TextDecoder().decode(bytes) });
    }

    if (files.length === 0) {
      throw new Error('No importable text files were found in this repository.');
    }

    return json({ name: `${repository.owner}/${repository.name}`, files });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Repository import failed.' }, { status: 400 });
  }
}

export function parseGitHubRepository(value: string): { owner: string; name: string; ref: string } {
  const url = new URL(value);

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Use an HTTPS GitHub repository URL.');
  }

  const [owner, rawName] = url.pathname.split('/').filter(Boolean);
  const name = rawName?.replace(/\.git$/i, '');
  const ref = url.hash.slice(1) || 'HEAD';

  if (!owner || !name || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) {
    throw new Error('The GitHub repository URL is invalid.');
  }

  return { owner, name, ref };
}

export function commonArchiveRoot(paths: string[]): string {
  const first = paths[0]?.split('/')[0];
  return first && paths.every((path) => path.startsWith(`${first}/`)) ? `${first}/` : '';
}

export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8_000).includes(0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

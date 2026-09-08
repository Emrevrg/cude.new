// Cude.new - serve.ts (Cude product surface, 2026)
import { createReadableStreamFromReadable } from '@remix-run/node';
import type { ServerBuild } from '@remix-run/node';
import mime from 'mime';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { isDev } from './constants';

export async function loadServerBuild(): Promise<ServerBuild | undefined> {
  if (isDev) {
    console.log('Dev mode: server build not loaded');
    return;
  }

  const serverBuildPath = path.join(app.getAppPath(), 'build', 'server', 'index.js');
  console.log(`Loading server build... path is ${serverBuildPath}`);

  try {
    const fileUrl = pathToFileURL(serverBuildPath).href;
    const serverBuild: ServerBuild = /** @type {ServerBuild} */ await import(fileUrl);
    if (!serverBuild.routes || !serverBuild.entry) {
      throw new Error('The packaged Remix server build is missing routes or entry. Rebuild the desktop package.');
    }
    console.log('Server build loaded successfully');

    // eslint-disable-next-line consistent-return
    return serverBuild;
  } catch (buildError) {
    console.log('Failed to load server build:', {
      message: (buildError as Error)?.message,
      stack: (buildError as Error)?.stack,
      error: JSON.stringify(buildError, Object.getOwnPropertyNames(buildError as object)),
    });

    throw buildError;
  }
}

// serve assets built by vite.
export async function serveAsset(req: Request, assetsPath: string): Promise<Response | undefined> {
  const url = new URL(req.url);
  const fullPath = path.join(assetsPath, decodeURIComponent(url.pathname));
  if (!fullPath.startsWith(assetsPath)) {
    console.log('Path is outside assets directory:', fullPath);
    return;
  }

  /*
   * Every request is offered to the static assets first and falls through to
   * the Remix build when there is no file — which is what happens for every
   * route and every API call the app makes. That is the ordinary path, not a
   * failure, and it was logged as "Failed to stat file" on each one: a healthy
   * launch filled the console with the word Failed before the window had even
   * finished painting.
   */
  const stat = await fs.stat(fullPath).catch(() => undefined);

  if (!stat?.isFile()) {
    return;
  }

  const headers = new Headers();
  const mimeType = mime.getType(fullPath);

  if (mimeType) {
    headers.set('Content-Type', mimeType);
  }

  console.log('Serving file with mime type:', mimeType);

  const body = createReadableStreamFromReadable(createReadStream(fullPath));

  // eslint-disable-next-line consistent-return
  return new Response(body, { headers });
}

/**
 * Cude.new — reading a reference page for the clone picker.
 *
 * The browser cannot read another origin, so the server does it and returns
 * the text. That makes this an outbound fetch on somebody's say-so, so it is
 * fenced: http(s) only, no address that names this machine or a private
 * network, one hop, a short timeout and a hard size cap.
 *
 * The check is on the hostname given and on where a redirect lands. That stops
 * the cases this feature can actually produce; it is not a substitute for
 * network egress rules if Cude is ever deployed beside an internal network
 * worth reaching.
 */
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.fetch-reference');

const MAX_BYTES = 200_000;
const TIMEOUT_MS = 8000;

/** Hostnames that name this machine or a network behind it. */
const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

function refuse(reason: string) {
  return Response.json({ ok: false, reason }, { status: 400 });
}

export async function readReference(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url');

  if (!target) {
    return refuse('No URL given.');
  }

  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    return refuse('That is not a URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return refuse('Only http and https can be read.');
  }

  if (PRIVATE_HOST.test(parsed.hostname)) {
    return refuse('That address is on a private network.');
  }

  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
    });

    if (!response.ok) {
      return Response.json({ ok: false, reason: `The page answered ${response.status}.` });
    }

    /*
     * A redirect can land somewhere the first check would have refused, so the
     * final URL is checked too.
     */
    if (PRIVATE_HOST.test(new URL(response.url).hostname)) {
      return refuse('That address redirects to a private network.');
    }

    const type = response.headers.get('content-type') ?? '';

    if (!/text\/html|text\/plain|application\/json/i.test(type)) {
      return Response.json({ ok: false, reason: 'That is not a page we can read.' });
    }

    const text = (await response.text()).slice(0, MAX_BYTES);

    return Response.json({
      ok: true,
      url: response.url,
      text: text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, ''),
    });
  } catch (error) {
    logger.debug('Could not read reference:', error);

    return Response.json({ ok: false, reason: 'The page could not be read.' });
  }
}

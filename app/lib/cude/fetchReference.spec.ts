/**
 * Cude.new — reading a reference page.
 *
 * The route fetches a URL somebody typed, which is the shape of request that
 * gets used to reach things it should not. These tests are mostly about what
 * it refuses.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { readReference } from './fetchReference';

function call(url: string | null) {
  const target = url === null ? '/api/fetch-reference' : `/api/fetch-reference?url=${encodeURIComponent(url)}`;

  return readReference(new Request(`http://localhost:5173${target}`));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what it refuses', () => {
  it('refuses a request with no URL', async () => {
    const response = await call(null);

    expect(response.status).toBe(400);
  });

  it('refuses something that is not a URL', async () => {
    expect((await call('not a url')).status).toBe(400);
  });

  it('refuses a scheme that is not http', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'data:text/html,hi']) {
      expect((await call(url)).status, url).toBe(400);
    }
  });

  it('refuses the machine it runs on', async () => {
    for (const url of ['http://localhost:5173/', 'http://127.0.0.1/', 'http://[::1]/']) {
      expect((await call(url)).status, url).toBe(400);
    }
  });

  it('refuses a private network address', async () => {
    for (const url of [
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://172.31.255.1/',
      'http://169.254.169.254/latest/meta-data/',
    ]) {
      expect((await call(url)).status, url).toBe(400);
    }
  });

  it('refuses a name that resolves inside a network', async () => {
    for (const url of ['http://printer.local/', 'http://vault.internal/']) {
      expect((await call(url)).status, url).toBe(400);
    }
  });

  it('lets a public address through the host check', async () => {
    for (const url of ['http://172.32.0.1/', 'http://11.0.0.1/', 'https://example.com/']) {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        url,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<p>hi</p>',
      } as unknown as Response);

      expect((await call(url)).status, url).toBe(200);
      expect(fetchSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
    }
  });

  it('never asks the network about an address it refused', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await call('http://192.168.0.1/');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('what it returns', () => {
  function page(body: string, type = 'text/html', url = 'https://example.com/') {
    return {
      ok: true,
      url,
      headers: new Headers({ 'content-type': type }),
      text: async () => body,
    } as unknown as Response;
  }

  it('strips scripts, styles and comments out of the page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      page('<h1>Title</h1><script>steal()</script><style>a{}</style><!-- note -->'),
    );

    const body = (await (await call('https://example.com/')).json()) as { ok: boolean; text: string };

    expect(body.ok).toBe(true);
    expect(body.text).toContain('Title');
    expect(body.text).not.toContain('steal()');
    expect(body.text).not.toContain('a{}');
    expect(body.text).not.toContain('note');
  });

  it('declines a response that is not a readable page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(page('binary', 'image/png'));

    const body = (await await call('https://example.com/')).json() as unknown as Promise<{ ok: boolean }>;

    expect((await body).ok).toBe(false);
  });

  it('reports an unhappy page rather than throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      url: 'https://example.com/',
      headers: new Headers(),
      text: async () => '',
    } as unknown as Response);

    const body = (await (await call('https://example.com/')).json()) as { ok: boolean; reason: string };

    expect(body.ok).toBe(false);
    expect(body.reason).toContain('404');
  });

  it('refuses a redirect that lands on a private address', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(page('<p>x</p>', 'text/html', 'http://192.168.1.1/admin'));

    expect((await call('https://example.com/')).status).toBe(400);
  });

  it('survives the network failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const body = (await (await call('https://example.com/')).json()) as { ok: boolean };

    expect(body.ok).toBe(false);
  });

  it('caps how much of a page it returns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(page('x'.repeat(500_000)));

    const body = (await (await call('https://example.com/')).json()) as { text: string };

    expect(body.text.length).toBeLessThanOrEqual(200_000);
  });
});

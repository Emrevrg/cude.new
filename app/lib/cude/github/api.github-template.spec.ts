import { afterEach, describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { fetchGitHub, loader } from '~/routes/api.github-template';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GitHub starter downloads', () => {
  it('retries public access when the optional token has expired', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchGitHub('https://api.github.com/repos/owner/template', 'expired')).ok).toBe(true);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer expired');
    expect(fetcher.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
  });

  it('does not retry forbidden or rate-limited requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchGitHub('https://api.github.com/repos/owner/template', 'token')).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('imports the default branch when no release exists and preserves Unicode', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const zip = new JSZip();
    zip.file('owner-template-sha/src/App.tsx', 'export const title = "Günlük işler ✓";');
    zip.file('owner-template-sha/package.json', '{"name":"starter"}');

    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetcher);

    const response = await loader({
      request: new Request('http://localhost/api/github-template?repo=owner/template'),
      context: {},
    });
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[1][0]).toBe('https://api.github.com/repos/owner/template/zipball');
    expect(await response.json()).toContainEqual({
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: 'export const title = "Günlük işler ✓";',
    });
  });

  it('rejects malformed repository paths before fetching', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    for (const repo of ['../secrets', 'owner/repo?token=x', 'https://evil.example/repo']) {
      const response = await loader({
        request: new Request(`http://localhost/api/github-template?repo=${encodeURIComponent(repo)}`),
        context: {},
      });
      expect(response.status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

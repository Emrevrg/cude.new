/**
 * Cude.new — the clone prompt.
 *
 * The prompt is the whole feature: everything the person picked has to reach
 * the model, and the instruction to write original code has to survive every
 * path through the builder. These tests hold both.
 */

import { describe, expect, it } from 'vitest';
import { buildClonePrompt, buildCloneMessage, extensionIdFromUrl, inferCloneTarget, isUrl, starterFor } from './clone';

describe('working out what someone means', () => {
  it('reads a plain page reference as a web page', () => {
    expect(inferCloneTarget('clone the linear landing page')).toBe('web');
    expect(inferCloneTarget('https://stripe.com')).toBe('web');
  });

  it('reads an extension reference as an extension', () => {
    expect(inferCloneTarget('a chrome extension that blocks ads')).toBe('extension');
    expect(inferCloneTarget('manifest v3 popup')).toBe('extension');
    expect(inferCloneTarget('https://chromewebstore.google.com/detail/ublock/cjpalhdlnbpafiamejdnhcphjbkeiagm')).toBe(
      'extension',
    );
  });

  it('reads an app reference as a desktop app', () => {
    expect(inferCloneTarget('desktop app like Notion')).toBe('desktop');
    expect(inferCloneTarget('something like Claude.exe')).toBe('desktop');
  });

  it('does not mistake a word inside another word for a match', () => {
    expect(inferCloneTarget('an extensible plugin system')).toBe('web');
  });
});

describe('store links', () => {
  it('reads the id out of a Chrome Web Store link', () => {
    expect(extensionIdFromUrl('https://chromewebstore.google.com/detail/ublock/cjpalhdlnbpafiamejdnhcphjbkeiagm')).toBe(
      'cjpalhdlnbpafiamejdnhcphjbkeiagm',
    );
  });

  it('still reads the older Chrome store URL', () => {
    expect(
      extensionIdFromUrl('https://chrome.google.com/webstore/detail/ublock/cjpalhdlnbpafiamejdnhcphjbkeiagm'),
    ).toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('reads an Edge add-on link', () => {
    expect(
      extensionIdFromUrl('https://microsoftedge.microsoft.com/addons/detail/ublock/odfafepnkmbhccpbejgmiehpchacaeak'),
    ).toBe('odfafepnkmbhccpbejgmiehpchacaeak');
  });

  it('reads a Firefox add-on slug', () => {
    expect(extensionIdFromUrl('https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/')).toBe('ublock-origin');
  });

  it('returns nothing for a link that is not a store page', () => {
    expect(extensionIdFromUrl('https://example.com/detail/whatever')).toBeNull();
  });
});

describe('telling a URL from a description', () => {
  it('accepts a real URL', () => {
    expect(isUrl('https://example.com')).toBe(true);
  });

  it('rejects prose, including prose that mentions a domain', () => {
    expect(isUrl('something like example.com')).toBe(false);
    expect(isUrl('not a url')).toBe(false);
  });
});

describe('the prompt', () => {
  const reference = { name: 'Claude', origin: 'installed' as const, facts: { Found: 'Start Menu' } };

  it('carries the name of the thing being cloned', () => {
    const prompt = buildClonePrompt({ target: 'desktop', reference });

    expect(prompt.user).toContain('Claude');
  });

  it('carries every fact the picker gathered', () => {
    const prompt = buildClonePrompt({
      target: 'extension',
      reference: {
        name: 'uBlock Origin',
        origin: 'installed',
        facts: { 'Extension id': 'cjpalhdlnbpafiamejdnhcphjbkeiagm', Browser: 'Chrome' },
      },
    });

    expect(prompt.user).toContain('cjpalhdlnbpafiamejdnhcphjbkeiagm');
    expect(prompt.user).toContain('Chrome');
  });

  it('leaves out a fact with no value, rather than printing an empty line', () => {
    const prompt = buildClonePrompt({
      target: 'extension',
      reference: { name: 'Something', facts: { Version: '', Browser: 'Chrome' } },
    });

    expect(prompt.user).not.toContain('Version:');
    expect(prompt.user).toContain('Browser: Chrome');
  });

  it('names the platform it is building for', () => {
    expect(buildClonePrompt({ target: 'desktop', reference }).system).toContain('desktop app');
    expect(buildClonePrompt({ target: 'extension', reference }).system).toContain('browser extension');
    expect(buildClonePrompt({ target: 'web', reference }).system).toContain('web page');
  });

  it('asks for original code on every target', () => {
    for (const target of ['web', 'desktop', 'extension'] as const) {
      expect(buildClonePrompt({ target, reference }).system).toMatch(/Write every line yourself/);
    }
  });

  it('tells the model to say what it assumed when only a name was given', () => {
    const prompt = buildClonePrompt({ target: 'web', reference: { name: 'Notion', origin: 'typed' } });

    expect(prompt.user).toMatch(/assuming/i);
  });

  it('treats an installed reference as exact', () => {
    expect(buildClonePrompt({ target: 'desktop', reference }).user).toMatch(/exact/i);
  });

  it('passes on what the person asked to change', () => {
    const prompt = buildClonePrompt({ target: 'desktop', reference, detail: 'dark mode only' });

    expect(prompt.user).toContain('dark mode only');
  });

  it('includes a fetched excerpt, and caps how much of it', () => {
    const prompt = buildClonePrompt({ target: 'web', reference }, 'x'.repeat(20000));

    expect(prompt.user).toContain('truncated');
    expect(prompt.user.length).toBeLessThan(12000);
  });

  it('leaves the excerpt section out entirely when nothing was fetched', () => {
    expect(buildClonePrompt({ target: 'web', reference }).user).not.toContain('```');
  });

  it('picks a starter template for every target', () => {
    for (const target of ['web', 'desktop', 'extension'] as const) {
      expect(starterFor(target)).toBeTruthy();
    }
  });
});

describe('the message the chat receives', () => {
  it('contains both halves of the prompt', () => {
    const request = { target: 'web' as const, reference: { name: 'Linear', origin: 'typed' as const } };
    const prompt = buildClonePrompt(request);
    const message = buildCloneMessage(request);

    expect(message).toContain(prompt.system);
    expect(message).toContain(prompt.user);
  });
});

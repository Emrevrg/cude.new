import { describe, it, expect } from 'vitest';
import { extensionTargets } from './previewTargets';
describe('extension preview pages', () => {
  it('reads MV3 popup, options and side panel', () =>
    expect(
      extensionTargets({
        '/home/project/manifest.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            manifest_version: 3,
            action: { default_popup: 'popup.html' },
            options_ui: { page: 'options.html' },
            side_panel: { default_path: 'side.html' },
          }),
        },
      }),
    ).toEqual([
      { label: 'Popup', path: '/popup.html' },
      { label: 'Options', path: '/options.html' },
      { label: 'Side panel', path: '/side.html' },
    ]));
  it('keeps nested extension folders relative to the workspace root', () =>
    expect(
      extensionTargets({
        '/home/project/extensions/shop/manifest.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({ manifest_version: 3, action: { default_popup: 'popup.html' } }),
        },
      }),
    ).toEqual([{ label: 'Popup', path: '/extensions/shop/popup.html' }]));
  it('ignores partially streamed manifests', () =>
    expect(extensionTargets({ '/manifest.json': { type: 'file', isBinary: false, content: '{' } })).toEqual([]));
  it('rejects external or traversing pages', () =>
    expect(
      extensionTargets({
        '/manifest.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            manifest_version: 3,
            action: { default_popup: 'https://example.com' },
            options_page: '../outside.html',
          }),
        },
      }),
    ).toEqual([]));
});

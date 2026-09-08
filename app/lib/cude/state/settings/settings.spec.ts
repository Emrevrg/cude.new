/**
 * Cude.new - settings behaviour.
 *
 * The corruption tests carry the weight here. Settings are read during the
 * first render, so a bad stored value must degrade to a default rather than
 * throw — the inherited implementation parsed each key inline and could leave a
 * preference half-applied.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySettingsStorage, SETTINGS_PREFIX, readJson } from './storage';
import { PreferencesDomain, normalizePreferences, PREFERENCES_KEY } from './preferences';
import { ProvidersDomain, scrubBaseUrl, normalizeProviders, PROVIDERS_KEY } from './providers';
import { WorkspaceLayoutDomain, reconcileLayout } from './workspaceLayout';
import {
  DEFAULT_SHORTCUTS,
  matchesShortcut,
  resolveShortcut,
  dispatchShortcut,
  registerShortcut,
  clearShortcutHandlers,
} from './shortcuts';
import { DEFAULT_PREFERENCES } from './types';

const key = (k: string) => SETTINGS_PREFIX + k;

describe('storage', () => {
  it('returns the fallback for a missing key', () => {
    const storage = new MemorySettingsStorage();
    expect(readJson(storage, 'nope', { a: 1 })).toEqual({ a: 1 });
  });

  it('returns the fallback for unparseable JSON instead of throwing', () => {
    const storage = new MemorySettingsStorage({ [key('x')]: '{ not json' });
    expect(readJson(storage, 'x', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when validation rejects the parsed shape', () => {
    const storage = new MemorySettingsStorage({ [key('x')]: '[1,2,3]' });
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);

    expect(readJson(storage, 'x', { ok: true }, isRecord)).toEqual({ ok: true });
  });
});

describe('preferences', () => {
  let storage: MemorySettingsStorage;

  beforeEach(() => {
    storage = new MemorySettingsStorage();
  });

  it('starts from the shipped defaults', () => {
    expect(new PreferencesDomain(storage).get()).toEqual(DEFAULT_PREFERENCES);
  });

  it('persists an update and reloads it', () => {
    new PreferencesDomain(storage).update({ contextOptimization: false, promptId: 'cude' });

    expect(new PreferencesDomain(storage).get()).toMatchObject({
      contextOptimization: false,
      promptId: 'cude',
    });
  });

  it('leaves other preferences untouched when one changes', () => {
    const domain = new PreferencesDomain(storage);
    const before = domain.get();
    domain.update({ developerMode: true });

    expect(domain.get()).toEqual({ ...before, developerMode: true });
  });

  it('replaces a wrong-typed stored value with the default', () => {
    /*
     * The inherited code stored booleans as strings in some paths, so a value
     * of "false" was read back as a truthy string.
     */
    storage.set(key(PREFERENCES_KEY), JSON.stringify({ eventLogs: 'false', promptId: 42 }));

    const prefs = new PreferencesDomain(storage).get();

    expect(prefs.eventLogs).toBe(DEFAULT_PREFERENCES.eventLogs);
    expect(prefs.promptId).toBe(DEFAULT_PREFERENCES.promptId);
  });

  it('survives a completely corrupt record', () => {
    storage.set(key(PREFERENCES_KEY), 'null');
    expect(new PreferencesDomain(storage).get()).toEqual(DEFAULT_PREFERENCES);
  });

  it('normalizes any input into a complete record', () => {
    expect(Object.keys(normalizePreferences(undefined)).sort()).toEqual(Object.keys(DEFAULT_PREFERENCES).sort());
  });

  it('resets to defaults', () => {
    const domain = new PreferencesDomain(storage);
    domain.update({ developerMode: true, eventLogs: false });

    expect(domain.reset()).toEqual(DEFAULT_PREFERENCES);
    expect(new PreferencesDomain(storage).get()).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('provider configuration', () => {
  let storage: MemorySettingsStorage;

  beforeEach(() => {
    storage = new MemorySettingsStorage();
  });

  it('treats an unknown provider as disabled', () => {
    expect(new ProvidersDomain(storage).isEnabled('Nope')).toBe(false);
  });

  it('persists an enable and reloads it', () => {
    new ProvidersDomain(storage).setEnabled('OpenAI', true);
    expect(new ProvidersDomain(storage).isEnabled('OpenAI')).toBe(true);
  });

  it('strips credentials embedded in a self-hosted base URL', () => {
    /*
     * `https://user:token@host` puts a secret into a field nobody thinks of as
     * sensitive, and it would be written straight to localStorage.
     */
    expect(scrubBaseUrl('https://user:supersecret@ollama.internal:11434')).not.toContain('supersecret');
    expect(scrubBaseUrl('https://user:supersecret@ollama.internal:11434')).toContain('ollama.internal');
  });

  it('keeps an ordinary base URL intact', () => {
    expect(scrubBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
  });

  it('keeps an unparseable base URL so the user can correct it', () => {
    expect(scrubBaseUrl('not a url')).toBe('not a url');
  });

  it('never writes a credential-bearing base URL to storage', () => {
    const domain = new ProvidersDomain(storage);
    domain.update('Ollama', { enabled: true, baseUrl: 'https://u:leaked-token@host:1234' });

    expect(storage.get(key(PROVIDERS_KEY))).not.toContain('leaked-token');
  });

  it('auto-enables configured providers the user has not decided about', () => {
    const domain = new ProvidersDomain(storage);
    domain.setEnabled('Anthropic', false);

    const enabled = domain.autoEnable(['OpenAI', 'Anthropic']);

    // Anthropic was explicitly turned off, so it must stay off.
    expect(enabled).toEqual(['OpenAI']);
    expect(domain.isEnabled('Anthropic')).toBe(false);
    expect(domain.isEnabled('OpenAI')).toBe(true);
  });

  it('discards a corrupt provider record', () => {
    storage.set(key(PROVIDERS_KEY), JSON.stringify({ OpenAI: 'yes please' }));
    expect(new ProvidersDomain(storage).isEnabled('OpenAI')).toBe(false);
  });

  it('normalizes a non-object into an empty configuration', () => {
    expect(normalizeProviders([1, 2])).toEqual({});
  });
});

describe('workspace layout', () => {
  const available = ['profile', 'settings', 'features'];

  it('ships every available tab when nothing is stored', () => {
    expect(reconcileLayout(null, available).tabs.map((t) => t.id)).toEqual(available);
  });

  it('drops a stored tab this build no longer ships', () => {
    // Rendering a tab with no icon is a crash, not a missing tile.
    const stored = {
      tabs: [
        { id: 'retired-tab', visible: true, order: 0 },
        { id: 'profile', visible: true, order: 1 },
      ],
    };

    expect(reconcileLayout(stored, available).tabs.map((t) => t.id)).toEqual(['profile', 'settings', 'features']);
  });

  it('appends newly shipped tabs rather than hiding them', () => {
    const stored = { tabs: [{ id: 'profile', visible: true, order: 0 }] };
    const tabs = reconcileLayout(stored, available).tabs;

    expect(tabs.map((t) => t.id)).toEqual(['profile', 'settings', 'features']);
    expect(tabs.every((t) => t.visible)).toBe(true);
  });

  it('preserves a stored hidden flag', () => {
    const stored = { tabs: [{ id: 'settings', visible: false, order: 0 }] };
    const layout = reconcileLayout(stored, available);

    expect(layout.tabs.find((t) => t.id === 'settings')?.visible).toBe(false);
  });

  it('renumbers order contiguously', () => {
    const stored = { tabs: [{ id: 'features', visible: true, order: 99 }] };

    expect(reconcileLayout(stored, available).tabs.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('persists a visibility change', () => {
    const storage = new MemorySettingsStorage();
    const domain = new WorkspaceLayoutDomain(storage, available);
    domain.setVisible('settings', false);

    expect(new WorkspaceLayoutDomain(storage, available).visibleTabs().map((t) => t.id)).toEqual([
      'profile',
      'features',
    ]);
  });
});

describe('shortcuts', () => {
  const event = (init: Partial<KeyboardEvent>) =>
    ({
      key: 'd',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: () => undefined,
      ...init,
    }) as KeyboardEvent;

  beforeEach(() => {
    clearShortcutHandlers();
  });

  it('matches the theme chord', () => {
    const matched = matchesShortcut(
      DEFAULT_SHORTCUTS.toggleTheme,
      event({ key: 'd', metaKey: true, altKey: true, shiftKey: true }),
      true,
    );

    expect(matched).toBe(true);
  });

  it('does not match when a modifier is missing', () => {
    expect(matchesShortcut(DEFAULT_SHORTCUTS.toggleTheme, event({ key: 'd', metaKey: true }), true)).toBe(false);
  });

  it('maps the primary modifier per platform', () => {
    const binding = DEFAULT_SHORTCUTS.toggleTerminal;

    expect(matchesShortcut(binding, event({ key: '`', metaKey: true }), true)).toBe(true);
    expect(matchesShortcut(binding, event({ key: '`', ctrlKey: true }), true)).toBe(false);
    expect(matchesShortcut(binding, event({ key: '`', ctrlKey: true }), false)).toBe(true);
  });

  it('resolves an event to a shortcut id', () => {
    expect(resolveShortcut(event({ key: '`', ctrlKey: true }), false)).toBe('toggleTerminal');
    expect(resolveShortcut(event({ key: 'z', ctrlKey: true }), false)).toBeNull();
  });

  it('runs a registered handler and prevents the default', () => {
    let ran = false;
    let prevented = false;
    registerShortcut('toggleTerminal', () => {
      ran = true;
    });

    const handled = dispatchShortcut(
      event({ key: '`', ctrlKey: true, preventDefault: () => (prevented = true) }),
      false,
    );

    expect(handled).toBe(true);
    expect(ran).toBe(true);
    expect(prevented).toBe(true);
  });

  it('does nothing when no handler is registered', () => {
    expect(dispatchShortcut(event({ key: '`', ctrlKey: true }), false)).toBe(false);
  });

  it('stops running a handler once it is unregistered', () => {
    let calls = 0;
    const off = registerShortcut('toggleTerminal', () => calls++);

    dispatchShortcut(event({ key: '`', ctrlKey: true }), false);
    off();
    dispatchShortcut(event({ key: '`', ctrlKey: true }), false);

    expect(calls).toBe(1);
  });
});

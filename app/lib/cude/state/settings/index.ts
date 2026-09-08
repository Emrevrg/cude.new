/**
 * Cude.new - settings.
 *
 * Public surface for the four settings domains, plus the small set of names the
 * existing call sites import. Those names are mapped onto the domains rather
 * than reimplemented, so there is one implementation and one place settings are
 * persisted.
 */

import { preferences } from './preferences';
import { providers, LOCAL_PROVIDERS, SELF_HOSTED_PROVIDERS } from './providers';
import { createWorkspaceLayout } from './workspaceLayout';

export { preferences, PreferencesDomain, normalizePreferences, PREFERENCES_KEY } from './preferences';
export {
  providers,
  ProvidersDomain,
  scrubBaseUrl,
  normalizeProviders,
  PROVIDERS_KEY,
  LOCAL_PROVIDERS,
  SELF_HOSTED_PROVIDERS,
} from './providers';
export {
  DEFAULT_SHORTCUTS,
  shortcutsStore,
  registerShortcut,
  matchesShortcut,
  resolveShortcut,
  dispatchShortcut,
  clearShortcutHandlers,
} from './shortcuts';
export { WorkspaceLayoutDomain, createWorkspaceLayout, reconcileLayout, LAYOUT_KEY } from './workspaceLayout';
export {
  LocalSettingsStorage,
  MemorySettingsStorage,
  createSettingsStorage,
  readJson,
  writeJson,
  SETTINGS_PREFIX,
} from './storage';
export {
  tabConfiguration,
  tabConfigurationStore,
  resetTabConfiguration,
  reconcileTabConfiguration,
  shippedUserTabs,
  TabConfigurationDomain,
  TAB_CONFIGURATION_KEY,
} from './tabConfiguration';
export { DEFAULT_PREFERENCES } from './types';
export type {
  CudePreferences,
  ProviderConfiguration,
  ProviderConfigurations,
  ShortcutBinding,
  ShortcutBindings,
  ShortcutId,
  LayoutTab,
  WorkspaceLayout,
  SettingsStorage,
} from './types';

/**
 * Providers whose endpoint the user can point elsewhere.
 *
 * Kept under the inherited name because several surfaces read it; it now comes
 * from the providers domain rather than a second hand-maintained list.
 */
export const URL_CONFIGURABLE_PROVIDERS = SELF_HOSTED_PROVIDERS;

/** Reactive preferences, for components. */
export const preferencesStore = preferences.store;

/** Reactive provider configuration, for components. */
export const providersStore = providers.store;

export const isDebugMode = {
  get: () => preferences.get().developerMode,
};

/** Layout of the settings surface. Tabs are supplied by the settings UI. */
let layout: ReturnType<typeof createWorkspaceLayout> | null = null;

export function initWorkspaceLayout(availableTabIds: string[]) {
  layout = createWorkspaceLayout(availableTabIds);
  return layout;
}

export function getWorkspaceLayout() {
  return layout;
}

export { LOCAL_PROVIDERS as LOCAL_PROVIDER_NAMES };

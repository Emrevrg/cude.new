/**
 * Cude.new - settings surface tab configuration.
 *
 * Implements the tab-configuration contract the settings UI consumes, on top of
 * this module's validated storage. Reconciliation is the important part: a
 * stored configuration naming a tab this build no longer ships used to survive
 * into the render, where the icon lookup returned `undefined` and rendering it
 * crashed the panel rather than omitting a tile.
 *
 * The richer `WorkspaceLayout` model in this module is where the settings UI
 * should end up; this keeps the current UI working, on Cude-owned code, until
 * that surface is rebuilt.
 */

import { map } from 'nanostores';
import type { TabWindowConfig, UserTabConfig, TabVisibilityConfig } from '~/components/@settings/core/types';
import { SURFACES } from '~/lib/cude/settings/surfaces';
import type { SettingsStorage } from './types';
import { createSettingsStorage, isPlainObject, readJson, writeJson } from './storage';

export const TAB_CONFIGURATION_KEY = 'tabConfiguration';

/**
 * The surfaces this build ships, in display order.
 *
 * Derived from the surface definitions rather than a second hand-maintained
 * list. The inherited default omitted profile and preferences from the user
 * window, so those surfaces were only reachable through a dropdown — and
 * unreachable at all once the panel stopped offering that path.
 */
export function shippedUserTabs(): UserTabConfig[] {
  return SURFACES.map((surface, index) => ({
    id: surface.id,
    visible: true,
    window: 'user',
    order: index,
  })) as UserTabConfig[];
}

/**
 * Reconcile a stored configuration against the tabs this build has.
 *
 * Unknown ids are dropped, newly shipped tabs are appended, and order is
 * renumbered contiguously.
 */
export function reconcileTabConfiguration(
  stored: unknown,
  shipped: UserTabConfig[] = shippedUserTabs(),
): TabWindowConfig {
  const byId = new Map(shipped.map((tab) => [tab.id, tab]));
  const userTabs: UserTabConfig[] = [];
  const seen = new Set<string>();

  const storedTabs = isPlainObject(stored) && Array.isArray(stored.userTabs) ? stored.userTabs : [];

  for (const entry of storedTabs) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') {
      continue;
    }

    const shippedTab = byId.get(entry.id as TabVisibilityConfig['id']);

    if (!shippedTab || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    userTabs.push({
      ...shippedTab,
      visible: typeof entry.visible === 'boolean' ? entry.visible : shippedTab.visible,
      order: typeof entry.order === 'number' ? entry.order : userTabs.length,
    });
  }

  for (const tab of shipped) {
    if (!seen.has(tab.id)) {
      userTabs.push({ ...tab, order: userTabs.length });
    }
  }

  userTabs.sort((a, b) => a.order - b.order);
  userTabs.forEach((tab, index) => {
    tab.order = index;
  });

  return { userTabs };
}

export class TabConfigurationDomain {
  readonly store = map<TabWindowConfig>({ userTabs: [] });

  constructor(private readonly _storage: SettingsStorage) {
    this.store.set(reconcileTabConfiguration(readJson<unknown>(this._storage, TAB_CONFIGURATION_KEY, null)));
  }

  get(): TabWindowConfig {
    return this.store.get();
  }

  set(config: TabWindowConfig): TabWindowConfig {
    const next = reconcileTabConfiguration(config);
    this.store.set(next);
    writeJson(this._storage, TAB_CONFIGURATION_KEY, next);

    return next;
  }

  /** Restore the shipped configuration. */
  reset(): TabWindowConfig {
    const next = reconcileTabConfiguration(null);
    this.store.set(next);
    writeJson(this._storage, TAB_CONFIGURATION_KEY, next);

    return next;
  }
}

export const tabConfiguration = new TabConfigurationDomain(createSettingsStorage());

/** Reactive tab configuration, for components. */
export const tabConfigurationStore = tabConfiguration.store;

export function resetTabConfiguration(): void {
  tabConfiguration.reset();
}

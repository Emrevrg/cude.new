/**
 * Cude.new - settings surface layout.
 *
 * Which tabs the settings surface shows and in what order. Reconciled against
 * the tabs the build actually has on every read: a stored layout that names a
 * tab this build no longer ships used to leave an entry whose icon lookup
 * returned `undefined`, and rendering that is a hard crash rather than a
 * missing tile.
 */

import { map } from 'nanostores';
import type { LayoutTab, SettingsStorage, WorkspaceLayout } from './types';
import { createSettingsStorage, isPlainObject, readJson, writeJson } from './storage';

export const LAYOUT_KEY = 'workspaceLayout';

/**
 * Reconcile a stored layout against the tabs this build ships.
 *
 * Unknown tabs are dropped; newly shipped tabs are appended in their default
 * order so an upgrade does not hide them.
 */
export function reconcileLayout(stored: unknown, availableTabIds: string[]): WorkspaceLayout {
  const known = new Set(availableTabIds);
  const tabs: LayoutTab[] = [];
  const seen = new Set<string>();

  const storedTabs = isPlainObject(stored) && Array.isArray(stored.tabs) ? stored.tabs : [];

  for (const entry of storedTabs) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !known.has(entry.id) || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    tabs.push({
      id: entry.id,
      visible: typeof entry.visible === 'boolean' ? entry.visible : true,
      order: typeof entry.order === 'number' ? entry.order : tabs.length,
    });
  }

  for (const id of availableTabIds) {
    if (!seen.has(id)) {
      tabs.push({ id, visible: true, order: tabs.length });
    }
  }

  tabs.sort((a, b) => a.order - b.order);
  tabs.forEach((tab, index) => {
    tab.order = index;
  });

  return { tabs };
}

export class WorkspaceLayoutDomain {
  readonly store = map<WorkspaceLayout>({ tabs: [] });

  constructor(
    private readonly _storage: SettingsStorage,
    private readonly _availableTabIds: string[],
  ) {
    this.store.set(reconcileLayout(readJson<unknown>(this._storage, LAYOUT_KEY, null), this._availableTabIds));
  }

  get(): WorkspaceLayout {
    return this.store.get();
  }

  /** Tabs to render, visible ones only, in order. */
  visibleTabs(): LayoutTab[] {
    return this.store.get().tabs.filter((tab) => tab.visible);
  }

  setVisible(id: string, visible: boolean): void {
    const tabs = this.store.get().tabs.map((tab) => (tab.id === id ? { ...tab, visible } : tab));
    this.store.set({ tabs });
    writeJson(this._storage, LAYOUT_KEY, { tabs });
  }

  /** Restore the shipped layout. */
  reset(): WorkspaceLayout {
    const next = reconcileLayout(null, this._availableTabIds);
    this.store.set(next);
    writeJson(this._storage, LAYOUT_KEY, next);

    return next;
  }
}

export function createWorkspaceLayout(availableTabIds: string[]): WorkspaceLayoutDomain {
  return new WorkspaceLayoutDomain(createSettingsStorage(), availableTabIds);
}

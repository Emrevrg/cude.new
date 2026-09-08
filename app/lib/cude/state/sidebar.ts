/**
 * Cude.new — whether the history panel is showing.
 *
 * The panel opens when the pointer reaches the left edge, which is pleasant
 * once you know it and invisible until then. The button in the header is the
 * discoverable way in, and it could not work while this was local state inside
 * the panel: nothing outside the component could reach it.
 */

import { atom } from 'nanostores';
import { readStored, writeStored } from './browserStore';

export const sidebarOpen = atom<boolean>(false);

/**
 * Whether the panel was opened deliberately rather than by the pointer.
 *
 * The two ways in want different ways out. Brushing the left edge opens it, so
 * moving away should close it again. Pressing the button is a decision, and a
 * panel that closed the moment the pointer moved would be unusable — you could
 * never reach anything in it.
 */
export const sidebarPinned = atom<boolean>(false);

const EDGE_OPEN_KEY = 'cude.sidebar.edgeOpen';
export const sidebarEdgeOpen = atom<boolean>(readStored<boolean>(EDGE_OPEN_KEY) ?? true);

export function setSidebarEdgeOpen(enabled: boolean): void {
  sidebarEdgeOpen.set(enabled);
  writeStored(EDGE_OPEN_KEY, enabled);

  if (!enabled && !sidebarPinned.get()) {
    closeSidebar();
  }
}

/** Opened by the pointer reaching the edge. Closes again when it leaves. */
export function openSidebarTransiently(): void {
  if (!sidebarEdgeOpen.get()) {
    return;
  }

  sidebarOpen.set(true);
}

/** Closes, whichever way it was opened. */
export function closeSidebar(): void {
  sidebarOpen.set(false);
  sidebarPinned.set(false);
}

/** The header button: opens and holds, or closes. */
export function toggleSidebar(): void {
  if (sidebarOpen.get()) {
    closeSidebar();
    return;
  }

  sidebarOpen.set(true);
  sidebarPinned.set(true);
}

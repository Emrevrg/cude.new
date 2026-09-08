/**
 * Cude.new - keyboard shortcuts.
 *
 * Bindings are data; handlers are registered by whoever owns the behaviour.
 * The inherited store stored the handler *inside* the binding, which meant the
 * shortcut record could not be serialized, compared, or reasoned about without
 * dragging in the theme store and the workbench.
 */

import { map } from 'nanostores';
import type { ShortcutBinding, ShortcutBindings, ShortcutId } from './types';

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  toggleTheme: {
    key: 'd',
    metaKey: true,
    altKey: true,
    shiftKey: true,
    description: 'Toggle theme',
    preventDefault: true,
  },
  toggleTerminal: {
    key: '`',
    ctrlOrMetaKey: true,
    description: 'Toggle terminal',
    preventDefault: true,
  },
};

export const shortcutsStore = map<ShortcutBindings>({ ...DEFAULT_SHORTCUTS });

type Handler = () => void;

const handlers = new Map<ShortcutId, Handler>();

/** Register what a shortcut does. Returns an unregister function. */
export function registerShortcut(id: ShortcutId, handler: Handler): () => void {
  handlers.set(id, handler);

  return () => {
    if (handlers.get(id) === handler) {
      handlers.delete(id);
    }
  };
}

/** True when the event matches the binding. */
export function matchesShortcut(binding: ShortcutBinding, event: KeyboardEvent, isMac: boolean): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }

  /*
   * `ctrlOrMetaKey` means "the platform's primary modifier": Command on macOS,
   * Control everywhere else. Checking both would fire on the wrong chord.
   */
  if (binding.ctrlOrMetaKey) {
    if (!(isMac ? event.metaKey : event.ctrlKey)) {
      return false;
    }
  } else {
    if (Boolean(binding.ctrlKey) !== event.ctrlKey) {
      return false;
    }

    if (Boolean(binding.metaKey) !== event.metaKey) {
      return false;
    }
  }

  if (Boolean(binding.shiftKey) !== event.shiftKey) {
    return false;
  }

  if (Boolean(binding.altKey) !== event.altKey) {
    return false;
  }

  return true;
}

/** Which shortcut, if any, an event triggers. */
export function resolveShortcut(event: KeyboardEvent, isMac: boolean): ShortcutId | null {
  const bindings = shortcutsStore.get();

  for (const id of Object.keys(bindings) as ShortcutId[]) {
    if (matchesShortcut(bindings[id], event, isMac)) {
      return id;
    }
  }

  return null;
}

/**
 * Run the handler for an event, if one is registered.
 *
 * Returns true when a shortcut ran, so the caller can decide about
 * `preventDefault` without re-resolving.
 */
export function dispatchShortcut(event: KeyboardEvent, isMac: boolean): boolean {
  const id = resolveShortcut(event, isMac);

  if (!id) {
    return false;
  }

  const handler = handlers.get(id);

  if (!handler) {
    return false;
  }

  if (shortcutsStore.get()[id].preventDefault) {
    event.preventDefault();
  }

  handler();

  return true;
}

/** Test seam: forget every registered handler. */
export function clearShortcutHandlers(): void {
  handlers.clear();
}

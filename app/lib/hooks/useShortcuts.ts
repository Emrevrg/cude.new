// Cude.new - useShortcuts.ts (Cude product surface, 2026)
/**
 * Cude.new - keyboard shortcuts, wired to the window.
 *
 * The matching logic lives in the settings domain and is unit tested there;
 * this hook only decides when the window should be listening and what a
 * shortcut does. The inherited version inlined the whole modifier-matching
 * algorithm inside a `useEffect`, where it could not be tested at all.
 */

import { useEffect } from 'react';
import { dispatchShortcut, registerShortcut, type ShortcutId } from '~/lib/cude/state/settings';
import { isMac } from '~/utils/os';
import { toggleTheme } from '~/lib/stores/theme';

/** Elements where a bare keystroke is text input, not a command. */
const TEXT_INPUT_ELEMENTS = ['input', 'textarea'];

class ShortcutEventEmitter {
  #emitter = new EventTarget();

  dispatch(type: ShortcutId) {
    this.#emitter.dispatchEvent(new Event(type));
  }

  on(type: ShortcutId, cb: VoidFunction) {
    this.#emitter.addEventListener(type, cb);

    return () => {
      this.#emitter.removeEventListener(type, cb);
    };
  }
}

export const shortcutEventEmitter = new ShortcutEventEmitter();

/** True when the keystroke is plain typing in a text field. */
function isTypingInTextField(event: KeyboardEvent): boolean {
  const active = document.activeElement;

  if (!active || !TEXT_INPUT_ELEMENTS.includes(active.tagName.toLowerCase())) {
    return false;
  }

  // A modified chord is still a command, even inside a text field.
  return !event.altKey && !event.metaKey && !event.ctrlKey;
}

export function useShortcuts(): void {
  useEffect(() => {
    const unregister = [
      registerShortcut('toggleTheme', () => {
        shortcutEventEmitter.dispatch('toggleTheme');
        toggleTheme();
      }),
      registerShortcut('toggleTerminal', () => {
        shortcutEventEmitter.dispatch('toggleTerminal');
      }),
    ];

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTypingInTextField(event)) {
        return;
      }

      dispatchShortcut(event, isMac);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);

      for (const off of unregister) {
        off();
      }
    };
  }, []);
}

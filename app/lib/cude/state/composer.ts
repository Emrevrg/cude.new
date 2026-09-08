/**
 * Cude.new — what is currently typed in the chat box.
 *
 * This used to be a prop handed down from the chat page: the value lived at the
 * top of the tree, so a keystroke re-rendered the page, the landing sections,
 * the workbench shell and everything between. The text only matters to the box
 * that holds it and to the moment it is sent, so it lives here instead and the
 * components that care subscribe.
 *
 * Everything that writes to the composer — typing, dictation, the prompt
 * enhancer, a web-search result, clearing after a send — goes through this
 * module, so there is one answer to "what is in the box".
 */

import { atom } from 'nanostores';

/** The draft, as it stands. Empty when the box is empty. */
export const composerText = atom<string>('');

/** Replaces the draft outright. */
export function setComposerText(value: string): void {
  composerText.set(value);
}

/** Empties the box, after a send or a cancelled dictation. */
export function clearComposer(): void {
  composerText.set('');
}

/**
 * Reads the draft without subscribing to it.
 *
 * For the send path, which needs the current value once and must not re-render
 * when it changes — subscribing there is what made typing expensive.
 */
export function readComposerText(): string {
  return composerText.get();
}

/**
 * Puts text in front of whatever is already typed.
 *
 * Web search results arrive while someone is mid-sentence; dropping their
 * words to make room for the result would be the wrong trade, and appending
 * buries the thing they just asked for.
 */
export function prependToComposer(text: string): void {
  const current = composerText.get();

  composerText.set(current.length > 0 ? `${text}\n\n${current}` : text);
}

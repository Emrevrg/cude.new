/**
 * Cude.new - the marker classes carried inside a message.
 *
 * A rendered assistant message can contain four kinds of embedded element: an
 * artifact, a thought, a quick action, and a reference to an element the user
 * picked in the preview. Each is marked with a class name so the renderer knows
 * what it is looking at.
 *
 * Cude writes its own names. The upstream ones are still recognised on input,
 * because conversations saved before the rename carry them and would otherwise
 * render as bare divs.
 */

export const ARTIFACT_MARKER = '__cudeArtifact__';
export const THOUGHT_MARKER = '__cudeThought__';
export const QUICK_ACTION_MARKER = '__cudeQuickAction__';
export const SELECTED_ELEMENT_MARKER = '__cudeSelectedElement__';

/** Every marker the renderer accepts. */
export const ALL_MARKERS = [ARTIFACT_MARKER, THOUGHT_MARKER, QUICK_ACTION_MARKER, SELECTED_ELEMENT_MARKER] as const;

function has(className: string | undefined, current: string): boolean {
  return Boolean(className) && className!.includes(current);
}

export function isArtifactMarker(className?: string): boolean {
  return has(className, ARTIFACT_MARKER);
}

export function isThoughtMarker(className?: string): boolean {
  return has(className, THOUGHT_MARKER);
}

export function isQuickActionMarker(className?: string): boolean {
  return has(className, QUICK_ACTION_MARKER);
}

export function isSelectedElementMarker(className?: string): boolean {
  return has(className, SELECTED_ELEMENT_MARKER);
}

/** Matches a thought block. */
export const THOUGHT_BLOCK = new RegExp(`<div class="${THOUGHT_MARKER}">.*?</div>`, 's');

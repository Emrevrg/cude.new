/**
 * Cude.new - filtering and moving through a list of options.
 *
 * The parts of a combobox that have nothing to do with the DOM. Pulled out
 * because the two pickers in the composer each had their own copy of this
 * arithmetic, and off-by-one errors in keyboard navigation are invisible until
 * someone actually tries to use the keyboard.
 */

export interface Option {
  value: string;
  label: string;

  /** Extra text that should also match a search. */
  detail?: string;
}

/**
 * Matches on every whitespace-separated term, in any order and any field.
 *
 * Typing "claude opus" should find "Opus (Anthropic)" — a substring match on
 * the whole query would not, and model names are routinely written in an order
 * nobody remembers.
 */
export function filterOptions<T extends Option>(options: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return options;
  }

  return options.filter((option) => {
    const haystack = `${option.label} ${option.detail ?? ''} ${option.value}`.toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * Where the focus goes next.
 *
 * Wraps at both ends: a list you can walk off is a list you have to look at to
 * use. Returns -1 for an empty list, which callers read as "nothing to focus".
 */
export function nextIndex(current: number, count: number, key: NavigationKey): number {
  if (count === 0) {
    return -1;
  }

  switch (key) {
    case 'ArrowDown':
      return current >= count - 1 ? 0 : current + 1;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

/**
 * Keeps a selection pointing at the same option after the list is refiltered.
 *
 * Without this, typing another letter silently moves the highlight to whatever
 * happens to sit at the old index.
 */
export function preserveFocus<T extends Option>(options: T[], focusedValue: string | undefined): number {
  if (options.length === 0) {
    return -1;
  }

  const index = options.findIndex((option) => option.value === focusedValue);

  return index === -1 ? 0 : index;
}

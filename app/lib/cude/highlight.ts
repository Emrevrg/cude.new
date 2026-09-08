/**
 * Cude.new — syntax highlighting, fetched when it is first needed.
 *
 * Shiki carries a WebAssembly regex engine, and between them they are the
 * largest thing this app can load — around a megabyte. Two components used to
 * build a highlighter with a top-level `await` at module scope, which pulled
 * all of it into the first chunk and blocked the module graph on it, whether
 * or not the page ever showed a line of code.
 *
 * Here it is imported on first use and the highlighter is kept, so the cost is
 * paid once, by the first block of code somebody actually looks at.
 */

import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki';

export type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>;

const THEMES: BundledTheme[] = ['light-plus', 'dark-plus'];

/*
 * One promise per language set, kept so that ten code blocks appearing at once
 * share a single load rather than starting ten of them.
 */
const pending = new Map<string, Promise<Highlighter>>();

/**
 * The highlighter for these languages, loading Shiki if this is the first ask.
 *
 * Rejects only if the chunk itself cannot be fetched; callers are expected to
 * fall back to unhighlighted text, which is still perfectly readable.
 */
export function getHighlighter(langs: BundledLanguage[]): Promise<Highlighter> {
  const key = [...langs].sort().join(',');
  const existing = pending.get(key);

  if (existing) {
    return existing;
  }

  const loading = import('shiki').then(({ createHighlighter }) =>
    createHighlighter({ langs, themes: THEMES }),
  ) as Promise<Highlighter>;

  pending.set(key, loading);

  // A failed load must not be cached, or the next block never gets a chance.
  loading.catch(() => pending.delete(key));

  return loading;
}

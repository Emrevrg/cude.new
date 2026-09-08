/**
 * Cude.new - how wide is this element, actually.
 *
 * Viewport breakpoints answer the wrong question for a panel that occupies some
 * fraction of the window. The workbench toolbar was laid out with `lg:` and so
 * chose its wide arrangement on a wide *window* while sitting in a nine-hundred
 * pixel *panel*, which quietly clipped the last tab off the row.
 *
 * Returns 0 until measured, so a first render can pick the narrow arrangement
 * and never flash a broken wide one.
 */

import { useEffect, useState, type RefObject } from 'react';

export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    setWidth(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

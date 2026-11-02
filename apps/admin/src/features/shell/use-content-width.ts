'use client';

import { type RefObject, useEffect, useState } from 'react';

/**
 * Content width of an element, kept up to date; null where ResizeObserver is unavailable. The
 * editor's canvas and the template preview lay a page out at a device width and scale it to this.
 */
export function useContentWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

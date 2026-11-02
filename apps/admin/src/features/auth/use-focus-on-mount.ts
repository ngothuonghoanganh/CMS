'use client';

import { type RefObject, useEffect, useRef } from 'react';

/**
 * A ref whose element takes focus once it appears: for a message that replaces the form whose
 * button had focus, which would otherwise fall back to the page. Give the element `tabIndex={-1}`.
 */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

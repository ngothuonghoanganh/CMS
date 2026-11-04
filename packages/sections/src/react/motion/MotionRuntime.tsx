'use client';

import { useEffect, useRef } from 'react';
import { startMotion } from './runtime.js';

/**
 * The page's motion on a live page or a preview (ADR-032). It renders nothing visible: a hidden
 * anchor finds the page it belongs to once React has hydrated it.
 */
export function MotionRuntime() {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-motion-root]');
    return root ? startMotion(root) : undefined;
  }, []);
  return <span ref={anchor} hidden />;
}

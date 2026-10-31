'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import styles from './Analytics.module.css';

export interface ScrollRegionProps {
  /** The region's name while it scrolls, e.g. "Bảng nguồn truy cập". */
  label: string;
  /** A table with nothing focusable inside. */
  children: ReactNode;
}

/**
 * A table that scrolls sideways on a narrow screen. Nothing inside takes focus, so while the table
 * is wider than its box the box is a named region in the tab order, and arrow keys scroll it (WCAG
 * 2.1.1). Where it fits (a desktop width) it is neither: a tab stop there would scroll nothing.
 * Measured again whenever the box or the table changes width (window, rows, fonts).
 */
export function ScrollRegion({ label, children }: ScrollRegionProps) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      setOverflows(element.scrollWidth > element.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild !== null) {
      observer.observe(element.firstElementChild);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={box}
      className={styles.tableScroll}
      {...(overflows ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

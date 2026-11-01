'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import styles from './ScrollRegion.module.css';

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
 * Once it holds focus it stays focusable until focus moves elsewhere in the page, even if the table
 * comes to fit (the window widens) or the window loses focus meanwhile: focus would otherwise fall
 * to the page (WCAG 2.4.3).
 * Measured again whenever the box or the table changes width (window, rows, fonts), also a table
 * that replaces the first one or comes late.
 */
export function ScrollRegion({ label, children }: ScrollRegionProps) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [focused, setFocused] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      setOverflows(element.scrollWidth > element.clientWidth);
    };
    measure();
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizes?.observe(element);
    let table: Element | null = null;
    const observeTable = () => {
      if (element.firstElementChild === table) {
        return;
      }
      if (table !== null) {
        resizes?.unobserve(table);
      }
      table = element.firstElementChild;
      if (table !== null) {
        resizes?.observe(table);
      }
    };
    observeTable();
    const replaced = new MutationObserver(() => {
      observeTable();
      measure();
    });
    replaced.observe(element, { childList: true });
    return () => {
      replaced.disconnect();
      resizes?.disconnect();
    };
  }, []);

  return (
    <div
      ref={box}
      className={styles.region}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={(event) => {
        // The window or tab losing focus blurs the region too, yet it stays the active element
        // and gets focus back with the window: only a move elsewhere in the page lets it go.
        if (event.currentTarget.contains(document.activeElement)) {
          return;
        }
        setFocused(false);
      }}
      {...(overflows || focused ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';

/** Elements that hold focus on purpose: a control the user is on, or moved to. */
const CONTROLS = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusIsOnAControl(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && active.matches(CONTROLS);
}

/**
 * "Tải thêm" and "Xem thêm" remove themselves with the last page, as "Bỏ bộ lọc" does with its
 * empty state, and the focus they had falls to the page (or to a dialog's frame). Call `expectMore`
 * when one is pressed: once the list shows more items and the focus was lost, the first new item
 * with an element `targetSelector` finds takes it, so a keyboard user carries on from there. While
 * the button is still there it keeps the focus.
 */
export function useFocusNewItems<List extends HTMLElement>(
  count: number,
  itemSelector: string,
  targetSelector: string,
) {
  const listRef = useRef<List>(null);
  const countBefore = useRef<number | null>(null);

  useEffect(() => {
    const before = countBefore.current;
    if (before === null || count <= before) {
      return;
    }
    countBefore.current = null;
    if (focusIsOnAControl()) {
      return;
    }
    const items = Array.from(listRef.current?.querySelectorAll(itemSelector) ?? []).slice(before);
    for (const item of items) {
      const target = item.querySelector<HTMLElement>(targetSelector);
      if (target !== null) {
        target.focus();
        return;
      }
    }
  }, [count, itemSelector, targetSelector]);

  return {
    listRef,
    expectMore: () => {
      countBefore.current = count;
    },
  };
}

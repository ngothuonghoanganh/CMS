'use client';

import { type RefObject, useRef } from 'react';

/**
 * Where focus goes back to when a dialog closes: the element that opened it. A menu item is gone
 * once its menu closes, so for a dialog opened from a `DropdownMenu` item it is the menu's trigger
 * (Radix labels the menu with its trigger's id).
 */
function returnTargetFor(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) {
    return null;
  }
  const menu = active.closest('[role="menu"]');
  if (menu === null) {
    return active;
  }
  const triggerId = menu.getAttribute('aria-labelledby');
  const trigger = triggerId === null ? null : document.getElementById(triggerId);
  return trigger instanceof HTMLElement ? trigger : null;
}

/**
 * Radix returns focus to its own `Trigger` only. Dialogs opened from state (a toolbar button, a
 * menu item, a keyboard shortcut) would drop focus on `<body>` when they close. This remembers the
 * element that had focus when the dialog opened (the menu trigger for a menu item) and focuses it
 * again on close. When that element is gone (the confirmed action removed it), focus goes to
 * `fallbackFocusRef` instead.
 */
export function useReturnFocus(fallbackFocusRef?: RefObject<HTMLElement | null>) {
  const returnTo = useRef<HTMLElement | null>(null);
  const rememberFocus = (): void => {
    returnTo.current = returnTargetFor(document.activeElement);
  };
  const restoreFocus = (event: Event): void => {
    const opener = returnTo.current;
    const target = opener?.isConnected ? opener : (fallbackFocusRef?.current ?? null);
    returnTo.current = null;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  };
  return { rememberFocus, restoreFocus };
}

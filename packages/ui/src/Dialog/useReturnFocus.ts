'use client';

import { type RefObject, useRef } from 'react';

/**
 * Where focus goes back to when a dialog closes: the element that opened it. A menu item is gone
 * once its menu closes, so for a dialog opened from a `DropdownMenu` item it is the menu's trigger
 * (Radix labels the menu with its trigger's id). A menu whose trigger cannot be found keeps the
 * item: focus returns to it if it is still there, otherwise to the fallback.
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
  return trigger instanceof HTMLElement ? trigger : active;
}

/**
 * Where focus goes when the opener is gone: the fallback the dialog was given, or else the page's
 * `<main>` that the skip link focuses (focusable with `tabindex="-1"`), so that the next Tab
 * carries on in the page's content rather than from the top of the document.
 */
function fallbackFor(fallbackFocusRef?: RefObject<HTMLElement | null>): HTMLElement | null {
  return fallbackFocusRef?.current ?? document.querySelector<HTMLElement>('main[tabindex="-1"]');
}

/**
 * The confirmed action may remove the opener only after the dialog closed: a list drops the row
 * once it has read itself again. Focus would fall from it to `<body>`; it goes to the fallback.
 * Watching ends as focus moves elsewhere or the opener goes.
 */
function moveOnWhenRemoved(opener: HTMLElement, fallback: () => HTMLElement | null) {
  const stop = (): void => {
    observer.disconnect();
    document.removeEventListener('focusin', onFocusIn);
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (event.target !== opener) {
      stop();
    }
  };
  const observer = new MutationObserver(() => {
    if (opener.isConnected) {
      return;
    }
    stop();
    const target = fallback();
    const active = document.activeElement;
    if ((active === null || active === document.body) && target?.isConnected) {
      target.focus();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('focusin', onFocusIn);
}

/**
 * Radix returns focus to its own `Trigger` only. Dialogs opened from state (a toolbar button, a
 * menu item, a keyboard shortcut) would drop focus on `<body>` when they close. This remembers the
 * element that had focus when the dialog opened (the menu trigger for a menu item) and focuses it
 * again on close. When that element is gone (the confirmed action removed it), focus goes to
 * `fallbackFocusRef`, or the page's `<main>`, instead; also when it goes later with focus still
 * on it.
 */
export function useReturnFocus(fallbackFocusRef?: RefObject<HTMLElement | null>) {
  const returnTo = useRef<HTMLElement | null>(null);
  const rememberFocus = (): void => {
    returnTo.current = returnTargetFor(document.activeElement);
  };
  const restoreFocus = (event: Event): void => {
    const opener = returnTo.current;
    const target = opener?.isConnected ? opener : fallbackFor(fallbackFocusRef);
    returnTo.current = null;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
      if (target === opener) {
        moveOnWhenRemoved(opener, () => fallbackFor(fallbackFocusRef));
      }
    }
  };
  return { rememberFocus, restoreFocus };
}

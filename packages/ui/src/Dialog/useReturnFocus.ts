'use client';

import { useRef } from 'react';

/**
 * Radix returns focus to its own `Trigger` only. Dialogs opened from state (a toolbar button, a
 * menu item, a keyboard shortcut) would drop focus on `<body>` when they close. This remembers the
 * element that had focus when the dialog opened and focuses it again on close.
 */
export function useReturnFocus() {
  const returnTo = useRef<HTMLElement | null>(null);
  const rememberFocus = (): void => {
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
  };
  const restoreFocus = (event: Event): void => {
    const target = returnTo.current;
    returnTo.current = null;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  };
  return { rememberFocus, restoreFocus };
}

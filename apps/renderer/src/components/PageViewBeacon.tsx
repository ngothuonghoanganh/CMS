'use client';

// The page-view module alone: this script runs on every live page, without the schemas.
import { INTERNAL_VISIT_STORAGE_KEY, PAGE_VIEW_ROUTE } from '@plp/contracts/page-view';
import { useEffect, useRef } from 'react';
import { hasInternalFlag, pageViewOf, withoutInternalFlag } from '../lib/page-view';

/** Whether this browser belongs to a member of the workspace (ADR-019). */
function isMemberBrowser(): boolean {
  try {
    return window.localStorage.getItem(INTERNAL_VISIT_STORAGE_KEY) === '1';
  } catch {
    // Storage is off (private browsing, blocked cookies): the browser is a visitor's.
    return false;
  }
}

function rememberMemberBrowser(): void {
  try {
    window.localStorage.setItem(INTERNAL_VISIT_STORAGE_KEY, '1');
  } catch {
    // Storage is off: this view is still not counted, later ones may be.
  }
}

/**
 * Sends one view per load of a live page (ADR-019), without cookies. A link from the admin
 * ("Xem trang live") flags the browser as a member's: it then never sends a view.
 */
export function PageViewBeacon() {
  // React runs effects twice in development; the page loaded once.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) {
      return;
    }
    sent.current = true;
    if (hasInternalFlag(window.location.search)) {
      rememberMemberBrowser();
      window.history.replaceState(
        window.history.state,
        '',
        withoutInternalFlag(window.location.href),
      );
      return;
    }
    if (isMemberBrowser()) {
      return;
    }
    navigator.sendBeacon(
      PAGE_VIEW_ROUTE,
      JSON.stringify(pageViewOf(window.location, document.referrer)),
    );
  }, []);
  return null;
}

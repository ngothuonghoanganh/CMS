'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** The fragment as it is: a string, so the snapshot stays the same while the link does. */
function currentHash(): string {
  return window.location.hash;
}

/** The secret of `#token=…`, or null when the fragment has none. */
export function linkTokenOf(hash: string): string | null {
  const token = new URLSearchParams(hash.slice(1)).get('token');
  return token === null || token === '' ? null : token;
}

/**
 * The secret of an account link (ADR-026), from the URL fragment, which never reaches a server or
 * its logs. Undefined while rendering on the server, where there is no fragment.
 */
export function useLinkToken(): string | null | undefined {
  const hash = useSyncExternalStore(subscribe, currentHash, () => undefined);
  return hash === undefined ? undefined : linkTokenOf(hash);
}

'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 30_000;

let current: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick() {
  current = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(tick, TICK_MS);
  // React re-reads the snapshot after subscribing, so the first client render after hydration
  // switches from the server's time to the browser's clock.
  current = Date.now();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * The current time (epoch ms) for relative labels ("2 giờ trước"), refreshed every 30 seconds.
 * The server render and hydration both use `serverTime` (when the server loaded the data), so
 * they produce the same text; the browser's clock takes over right after hydration.
 */
export function useNow(serverTime: number): number {
  return useSyncExternalStore(
    subscribe,
    () => current ?? serverTime,
    () => serverTime,
  );
}

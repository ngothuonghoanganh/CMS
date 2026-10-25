/**
 * Browser Back/Forward between admin screens is a client-side navigation: no `beforeunload`, and
 * the App Router renders the other screen from its popstate listener. That listener is added after
 * hydration, and listeners run in the order they were added, so this module's listener is
 * installed when the root providers load (before hydration) and runs first. A screen that would
 * lose changes registers a guard here and can keep the router from handling the event.
 */

/** Returns true when it kept this Back/Forward from reaching the router. */
export type HistoryGuard = (event: PopStateEvent) => boolean;

let guard: HistoryGuard | null = null;
let installed = false;

function onPopState(event: PopStateEvent) {
  if (guard?.(event)) {
    event.stopImmediatePropagation();
  }
}

/** Adds the popstate listener once. The root providers call it while their module loads. */
export function installHistoryGuard(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;
  window.addEventListener('popstate', onPopState);
}

/** Lets the current screen veto Back/Forward; returns the function that removes the guard. */
export function setHistoryGuard(next: HistoryGuard): () => void {
  installHistoryGuard();
  guard = next;
  return () => {
    if (guard === next) {
      guard = null;
    }
  };
}

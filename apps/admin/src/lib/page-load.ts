/**
 * Opens `href` with a full page load: nothing the admin holds in memory (React state, the
 * TanStack Query cache) survives it. A module of its own so tests can stand in for it, since jsdom
 * cannot navigate.
 */
export function loadPage(href: string): void {
  window.location.assign(href);
}

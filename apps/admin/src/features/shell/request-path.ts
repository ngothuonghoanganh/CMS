/**
 * Set by the proxy on every page request: its path and query, so a workspace's screen opened at
 * another address can open the same path at its own (ADR-025).
 */
export const REQUEST_PATH_HEADER = 'x-plp-path';

/**
 * What the live page's script needs to send a view (ADR-019), apart from any schema: the script
 * runs on every live page, so it imports this module alone (`@plp/contracts/page-view`), never
 * the schemas and their library.
 */

/** The renderer route the page script sends a view to. */
export const PAGE_VIEW_ROUTE = '/_e';

/** A view is a path and where the visitor came from; a larger body is not one. */
export const PAGE_VIEW_MAX_BYTES = 2048;

/**
 * Search parameter the admin's links to live pages add ("Xem trang live"): the browser that opens
 * one stops counting its own views (ADR-019).
 */
export const INTERNAL_VISIT_PARAM = 'plp_internal';

/** The browser storage key that remembers a member's browser. */
export const INTERNAL_VISIT_STORAGE_KEY = 'plp_internal';

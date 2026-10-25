import { INTERNAL_VISIT_PARAM } from '@plp/contracts';

/**
 * Display helpers for public site addresses: a site's `defaultOrigin` ("https://smile.payload.site")
 * and a page's `liveUrl` ("https://smile.payload.site/uu-dai"). The API builds those URLs; the admin
 * only shows them.
 */

const PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;

/** "https://smile.payload.site" → "smile.payload.site" (keeps a port, e.g. "smile.localhost:3101"). */
export function hostOf(url: string): string {
  return new URL(url).host;
}

/**
 * A URL as people read it, without the protocol or a trailing slash:
 * "https://smile.payload.site/uu-dai" → "smile.payload.site/uu-dai".
 */
export function displayUrl(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return `${parsed.host}${path}${parsed.search}`;
}

/** The path of a page slug as shown in lists: "" (home page) → "/", "uu-dai" → "/uu-dai". */
export function slugPath(slug: string): string {
  return `/${slug}`;
}

/**
 * The host a new site will get, from `PUBLIC_SITE_ORIGIN_TEMPLATE` ("https://{subdomain}.payload.site")
 * and the subdomain being typed. Works for incomplete input, since it is a preview while typing.
 */
export function defaultHostPreview(originTemplate: string, subdomain: string): string {
  return originTemplate.replace('{subdomain}', subdomain).replace(PROTOCOL, '').replace(/\/+$/, '');
}

/**
 * A live page opened from the admin ("Xem trang live"): the page's script then flags this browser
 * as a member's and never counts its views (ADR-019). Addresses to share (QR code, copy) stay
 * plain.
 */
export function internalVisitUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(INTERNAL_VISIT_PARAM, '1');
  return parsed.toString();
}

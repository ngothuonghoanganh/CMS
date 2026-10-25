import type { PageView } from '@plp/contracts';
import { INTERNAL_VISIT_PARAM } from '@plp/contracts/page-view';

/** Longer values are not campaign tags; the API would refuse the view. */
const SOURCE_VALUE_MAX = 500;
const REFERRER_MAX = 1000;

function tag(query: URLSearchParams, name: string): string | null {
  const value = query.get(name);
  return value === null || value === '' ? null : value.slice(0, SOURCE_VALUE_MAX);
}

/** The view a live page sends (ADR-019): its path, campaign tags and the page the visitor came from. */
export function pageViewOf(
  location: { pathname: string; search: string },
  referrer: string,
): PageView {
  const query = new URLSearchParams(location.search);
  return {
    path: location.pathname,
    source: {
      utmSource: tag(query, 'utm_source'),
      utmMedium: tag(query, 'utm_medium'),
      utmCampaign: tag(query, 'utm_campaign'),
      referrer: referrer === '' ? null : referrer.slice(0, REFERRER_MAX),
    },
  };
}

/** The admin opened this page for a member of the workspace ("Xem trang live"). */
export function hasInternalFlag(search: string): boolean {
  return new URLSearchParams(search).get(INTERNAL_VISIT_PARAM) === '1';
}

/** The address without that flag, to put back in the history. */
export function withoutInternalFlag(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(INTERNAL_VISIT_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

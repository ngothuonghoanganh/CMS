import type { PathStatusResponse } from '@plp/contracts';
import { slugFromSegments } from './routing';

/** Rewrite target for a miss: Next serves the root not-found page there with status 404. */
export const NOT_FOUND_ROUTE = '/_not-found';

export type GateDecision =
  | { kind: 'not_found' }
  /** `liveReleaseId`: the release live at the path, or null for a redirect. */
  | { kind: 'render'; liveReleaseId: string | null };

const NOT_FOUND: GateDecision = { kind: 'not_found' };

/**
 * Next 16 renders `notFound()` thrown by a page as an empty error document whose not-found UI
 * appears only after hydration, so without JavaScript a visitor would see a blank page. The proxy
 * therefore decides before rendering: a miss is rewritten to the prerendered not-found page
 * (server-rendered Vietnamese message, status 404), everything else renders normally.
 *
 * Answers `not_found` when the host is not a site, the path cannot hold a page, or nothing
 * answers there; `render` for a live page or a redirect (the page answers the 308 itself).
 */
export async function notFoundGate(
  request: { subdomain: string | null; pathname: string },
  lookup: (subdomain: string, slug: string) => Promise<PathStatusResponse | null>,
): Promise<GateDecision> {
  if (request.subdomain === null) {
    return NOT_FOUND;
  }
  let segments: string[];
  try {
    segments = request.pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) => decodeURIComponent(segment));
  } catch {
    // A malformed escape sequence cannot name a page.
    return NOT_FOUND;
  }
  const slug = slugFromSegments(segments);
  if (slug === null) {
    return NOT_FOUND;
  }
  const status = await lookup(request.subdomain, slug);
  if (status === null) {
    return NOT_FOUND;
  }
  return { kind: 'render', liveReleaseId: status.kind === 'page' ? status.releaseId : null };
}

import type { PathStatusResponse } from '@plp/contracts';
import { sameSiteLocation, slugFromSegments } from './routing';

/** Rewrite target for a miss: Next serves the root not-found page there with status 404. */
export const NOT_FOUND_ROUTE = '/_not-found';

export type GateDecision =
  | { kind: 'not_found' }
  /** `location`: absolute path on the same site the old slug moved to. */
  | { kind: 'redirect'; location: string }
  /** `liveReleaseId`: the release live at the path. */
  | { kind: 'render'; liveReleaseId: string };

/** What answers at the path; null when nothing does. */
export type PathStatusLookup = (
  subdomain: string,
  slug: string,
) => Promise<PathStatusResponse | null>;

const NOT_FOUND: GateDecision = { kind: 'not_found' };

/**
 * Decides a miss and a redirect before rendering, so neither depends on how Next renders the page:
 * - Next 16 renders `notFound()` thrown by a page as an empty error document whose not-found UI
 *   appears only after hydration, so without JavaScript a visitor would see a blank page. A miss
 *   is therefore rewritten to the prerendered not-found page (server-rendered Vietnamese message,
 *   status 404).
 * - The page's own 308 is a real status only when Next renders it in blocking mode, which
 *   `htmlLimitedBots` turns on only for requests that send a User-Agent; any other client would
 *   get a 200 shell without a Location header. A redirect is therefore answered here.
 *
 * Answers `not_found` when the host is not a site, the path cannot hold a page, or nothing
 * answers there; `redirect` for an old slug; `render` for a live page.
 */
export async function pathGate(
  request: { subdomain: string | null; pathname: string },
  lookupStatus: PathStatusLookup,
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
  const status = await lookupStatus(request.subdomain, slug);
  if (status === null) {
    return NOT_FOUND;
  }
  return status.kind === 'page'
    ? { kind: 'render', liveReleaseId: status.releaseId }
    : { kind: 'redirect', location: sameSiteLocation(status.location) };
}

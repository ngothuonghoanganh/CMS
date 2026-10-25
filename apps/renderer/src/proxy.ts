import { type NextRequest, NextResponse } from 'next/server';
import { rendererEnv } from './env';
import { subdomainFromHeaders } from './lib/host';
import { LIVE_RELEASE_HEADER } from './lib/live-release';
import { NOT_FOUND_ROUTE, notFoundGate } from './lib/not-found-gate';
import { getPathStatus } from './lib/public-api';

/** Public page requests only; assets, previews, webhooks and the SEO files answer on their own. */
export const config = {
  matcher: ['/((?!_next/|_preview/|api/|(?:healthz|sitemap\\.xml|robots\\.txt)$).*)'],
};

/**
 * Serves a miss as the server-rendered not-found page with status 404 (see `notFoundGate`), and
 * hands the page the id of the live release, which keys its cached lookup (ADR-009).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Only this proxy may say which release is live: a value sent by the client would let anyone
  // fill the cache with entries under made-up keys.
  const forwarded = new Headers(request.headers);
  forwarded.delete(LIVE_RELEASE_HEADER);
  try {
    const decision = await notFoundGate(
      {
        subdomain: subdomainFromHeaders(request.headers, rendererEnv()),
        pathname: request.nextUrl.pathname,
      },
      getPathStatus,
    );
    if (decision.kind === 'not_found') {
      return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, request.url), { status: 404 });
    }
    if (decision.liveReleaseId !== null) {
      forwarded.set(LIVE_RELEASE_HEADER, decision.liveReleaseId);
    }
  } catch (error) {
    // The page makes the same decision from its cached lookup and still answers 404 for a miss;
    // only the no-JavaScript body of that 404 and the release part of the cache key depend on
    // this check.
    console.error('Not-found check failed; rendering the page instead', error);
  }
  return NextResponse.next({ request: { headers: forwarded } });
}

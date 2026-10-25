import { type NextRequest, NextResponse } from 'next/server';
import { rendererEnv } from './env';
import { subdomainFromHeaders } from './lib/host';
import { LIVE_RELEASE_HEADER } from './lib/live-release';
import { NOT_FOUND_ROUTE, pathGate } from './lib/path-gate';
import { getPathStatus } from './lib/public-api';

/**
 * Public page requests only; assets, previews, webhooks, the SEO files and the lead route
 * (`/_lead`, ADR-016) answer on their own.
 */
export const config = {
  matcher: ['/((?!_next/|_preview/|api/|(?:healthz|sitemap\\.xml|robots\\.txt|_lead|_e)$).*)'],
};

/**
 * Serves a miss as the server-rendered not-found page with status 404 and an old slug as a 308
 * (see `pathGate`), and hands the page the id of the live release, which keys its cached lookup
 * (ADR-009).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Only this proxy may say which release is live: a value sent by the client would let anyone
  // fill the cache with entries under made-up keys.
  const forwarded = new Headers(request.headers);
  forwarded.delete(LIVE_RELEASE_HEADER);
  try {
    const decision = await pathGate(
      {
        subdomain: subdomainFromHeaders(request.headers, rendererEnv()),
        pathname: request.nextUrl.pathname,
      },
      getPathStatus,
    );
    if (decision.kind === 'not_found') {
      return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, request.url), { status: 404 });
    }
    if (decision.kind === 'redirect') {
      // Next sends a same-host Location as a relative path, as the page's own redirect does.
      return NextResponse.redirect(new URL(decision.location, request.url), 308);
    }
    forwarded.set(LIVE_RELEASE_HEADER, decision.liveReleaseId);
  } catch (error) {
    // The page makes the same decision from its cached lookup and still answers 404 or 308; only
    // the no-JavaScript body of that 404, the 308 for clients without a User-Agent and the release
    // part of the cache key depend on this check.
    console.error('Path check failed; rendering the page instead', error);
  }
  return NextResponse.next({ request: { headers: forwarded } });
}

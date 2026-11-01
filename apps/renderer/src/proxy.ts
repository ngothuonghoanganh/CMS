import { type NextRequest, NextResponse } from 'next/server';
import { rendererEnv } from './env';
import { hostnameOf, requestHost } from './lib/host';
import { LIVE_RELEASE_HEADER } from './lib/live-release';
import { NOT_FOUND_ROUTE, pathGate } from './lib/path-gate';
import { previewStatusForHost, previewTokenOf } from './lib/preview-gate';
import { getPathStatus, getPreviewStatus, lookupHostSite } from './lib/public-api';
import { primaryAddressUrl, SITE_HEADER, subdomainForRequest } from './lib/request-site';
import { unavailablePage } from './lib/responses';

/**
 * Public pages and previews; assets, webhooks, the SEO files and the visitor routes (`/_lead`,
 * ADR-016; `/_e`, ADR-019) answer on their own.
 */
export const config = {
  matcher: ['/((?!_next/|api/|(?:healthz|sitemap\\.xml|robots\\.txt|_lead|_e)$).*)'],
};

/** Stands in for a missing User-Agent; see `proxy`. */
export const UNKNOWN_USER_AGENT = 'unknown';

/**
 * The prerendered not-found page with status 404. It goes out with the request headers below, as a
 * page does: without a User-Agent Next would send its static copy with `s-maxage` of a year, and a
 * shared cache would keep answering 404 after a page is published at that path.
 */
function notFound(request: NextRequest, headers: Headers): NextResponse {
  return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, request.url), {
    status: 404,
    request: { headers },
  });
}

/**
 * Decides what answers before anything renders, so no status depends on how Next renders a page:
 * - a miss (page or preview) is the server-rendered not-found page with status 404;
 * - an old slug is a 308 (see `pathGate`);
 * - when the API cannot answer, a 503 with `Retry-After` (ADR-009). Rendering anyway would only
 *   wait on the same API again, and a page cannot answer 503 itself: Next sends 500.
 * - a page asked on another host of a site whose primary custom domain is active is a 301 there,
 *   with its path and query (ADR-022). Previews stay where their link points.
 *
 * A live page also gets the id of its live release, which keys its cached lookup (ADR-009), and
 * every request the subdomain of its site, custom domains resolved (ADR-022).
 */
export async function proxy(request: NextRequest): Promise<Response> {
  // Only this proxy may say which release is live: a value sent by the client would let anyone
  // fill the cache with entries under made-up keys.
  const forwarded = new Headers(request.headers);
  forwarded.delete(LIVE_RELEASE_HEADER);
  forwarded.delete(SITE_HEADER);
  // Next renders in blocking mode (real status codes, head tags in <head>) only for requests that
  // send a User-Agent (`htmlLimitedBots`); any other client would get a streamed 200 shell even
  // when the page then fails.
  if ((forwarded.get('user-agent') ?? '').trim() === '') {
    forwarded.set('user-agent', UNKNOWN_USER_AGENT);
  }
  const env = rendererEnv();
  let subdomain: string | null;
  try {
    subdomain = await subdomainForRequest(request.headers, env, lookupHostSite);
  } catch (error) {
    console.error('Host lookup failed; answering 503', error);
    return unavailablePage({ noindex: false });
  }
  if (subdomain !== null) {
    forwarded.set(SITE_HEADER, subdomain);
  }
  const token = previewTokenOf(request.nextUrl.pathname);

  if (token !== null) {
    try {
      // Only the token and its site: the page makes the one full load of the preview.
      const preview = await previewStatusForHost({ subdomain, token }, getPreviewStatus);
      if (preview === null) {
        return notFound(request, forwarded);
      }
    } catch (error) {
      console.error('Preview check failed; answering 503', error);
      return unavailablePage({ noindex: true });
    }
    return NextResponse.next({ request: { headers: forwarded } });
  }

  try {
    const decision = await pathGate(
      { subdomain, pathname: request.nextUrl.pathname },
      getPathStatus,
    );
    if (decision.kind === 'not_found') {
      return notFound(request, forwarded);
    }
    const host = hostnameOf(requestHost(request.headers, env.TRUST_PROXY));
    if (decision.primaryHost !== null && decision.primaryHost !== host) {
      return NextResponse.redirect(
        primaryAddressUrl(decision.primaryHost, request.nextUrl, env),
        301,
      );
    }
    if (decision.kind === 'redirect') {
      // Next sends a same-host Location as a relative path, as the page's own redirect does. The
      // visitor's query goes along: an ad's utm tags and click ids still reach the page.
      const location = new URL(decision.location, request.url);
      location.search = request.nextUrl.search;
      return NextResponse.redirect(location, 308);
    }
    forwarded.set(LIVE_RELEASE_HEADER, decision.liveReleaseId);
  } catch (error) {
    console.error('Path check failed; answering 503', error);
    return unavailablePage({ noindex: false });
  }
  return NextResponse.next({ request: { headers: forwarded } });
}

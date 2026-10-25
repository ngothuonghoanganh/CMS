import { PAGE_VIEW_MAX_BYTES, pageViewSchema } from '@plp/contracts';
import { rendererEnv } from '../../env';
import { clientAddress } from '../../lib/client-address';
import { requestHost, subdomainFromHeaders } from '../../lib/host';
import { relayPageView } from '../../lib/page-view-relay';
import { readBodyWithin } from '../../lib/request-body';
import { isCrossSite } from '../../lib/same-site';

// `/_e` (ADR-019): the folder is "%5Fe" because "_e" would be a private folder. Response headers
// (noindex, no-referrer) come from next.config.ts.

const NO_CONTENT = new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

function parseView(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not JSON: not a view the page script sent; dropped like any other malformed body.
    return null;
  }
}

/**
 * One view of a live page, from its script's `sendBeacon` (a text body holding JSON). The answer is
 * always 204: a view that is not counted is not the visitor's concern, and nothing is said about
 * why. Valid views are relayed to the API with the visitor's address and user agent, signed.
 */
export async function POST(request: Request): Promise<Response> {
  const env = rendererEnv();
  const subdomain = subdomainFromHeaders(request.headers, env);
  if (subdomain === null || isCrossSite(request, requestHost(request.headers, env.TRUST_PROXY))) {
    return NO_CONTENT.clone();
  }
  const raw = await readBodyWithin(request, PAGE_VIEW_MAX_BYTES);
  const view = pageViewSchema.safeParse(raw === null ? null : parseView(raw));
  if (view.success) {
    await relayPageView({
      subdomain,
      view: view.data,
      clientIp: clientAddress(request.headers, env.TRUST_PROXY),
      userAgent: request.headers.get('user-agent') ?? '',
      env,
    });
  }
  return NO_CONTENT.clone();
}

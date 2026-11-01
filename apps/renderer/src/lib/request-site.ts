import { subdomainSchema } from '@plp/contracts';
import type { RendererEnv } from '../env';
import { type HeaderSource, hostTarget, requestHost } from './host';

/**
 * Request header through which the proxy hands pages the subdomain of the site the host addresses,
 * custom domains resolved (ADR-022). It is internal: the proxy removes any value a client sends.
 */
export const SITE_HEADER = 'x-plp-site';

/** The subdomain of the site a custom domain serves; null when it serves none. */
export type HostSiteLookup = (hostname: string) => Promise<string | null>;

/**
 * The site a request addresses: its default address directly, a custom domain through `lookup`
 * (ADR-022). Null when the host is no site's.
 */
export async function subdomainForRequest(
  headers: HeaderSource,
  env: Pick<RendererEnv, 'BASE_DOMAIN' | 'TRUST_PROXY'>,
  lookup: HostSiteLookup,
): Promise<string | null> {
  const target = hostTarget(requestHost(headers, env.TRUST_PROXY), env.BASE_DOMAIN);
  if (target === null) {
    return null;
  }
  return target.kind === 'default' ? target.subdomain : lookup(target.hostname);
}

/** The subdomain the proxy found; null when it found none (or the header is not one). */
export function subdomainFromSiteHeader(headers: HeaderSource): string | null {
  const value = headers.get(SITE_HEADER);
  const parsed = value === null ? null : subdomainSchema.safeParse(value);
  return parsed?.success === true && parsed.data === value ? value : null;
}

/**
 * Where a request on another host of the site goes: the same path and query on the primary
 * custom domain, with the protocol and port the site's addresses use.
 */
export function primaryAddressUrl(
  primaryHost: string,
  url: { pathname: string; search: string },
  env: Pick<RendererEnv, 'BASE_DOMAIN' | 'PUBLIC_SITE_PROTOCOL'>,
): string {
  const port = /:\d+$/.exec(env.BASE_DOMAIN)?.[0] ?? '';
  return `${env.PUBLIC_SITE_PROTOCOL}://${primaryHost}${port}${url.pathname}${url.search}`;
}

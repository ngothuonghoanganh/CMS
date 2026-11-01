import { headers } from 'next/headers';
import { rendererEnv } from '../env';
import { subdomainFromHeaders } from './host';
import { liveReleaseFrom } from './live-release';
import { subdomainFromSiteHeader } from './request-site';

/**
 * Subdomain of the site the current request addresses, or null when the host is not a site. The
 * proxy resolved it, custom domains included (ADR-022); a default address is read again only when
 * the proxy did not run.
 */
export async function currentSubdomain(): Promise<string | null> {
  const current = await headers();
  return subdomainFromSiteHeader(current) ?? subdomainFromHeaders(current, rendererEnv());
}

/** Id of the release live at the requested path, as the proxy found it; '' when unknown. */
export async function currentLiveRelease(): Promise<string> {
  return liveReleaseFrom(await headers());
}

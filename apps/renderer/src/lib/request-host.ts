import { headers } from 'next/headers';
import { rendererEnv } from '../env';
import { subdomainFromHeaders } from './host';

/** Subdomain of the site the current request addresses, or null when the host is not a site. */
export async function currentSubdomain(): Promise<string | null> {
  return subdomainFromHeaders(await headers(), rendererEnv());
}

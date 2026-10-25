import { headers } from 'next/headers';
import { rendererEnv } from '../env';
import { subdomainFromHeaders } from './host';
import { liveReleaseFrom } from './live-release';

/** Subdomain of the site the current request addresses, or null when the host is not a site. */
export async function currentSubdomain(): Promise<string | null> {
  return subdomainFromHeaders(await headers(), rendererEnv());
}

/** Id of the release live at the requested path, as the proxy found it; '' when unknown. */
export async function currentLiveRelease(): Promise<string> {
  return liveReleaseFrom(await headers());
}

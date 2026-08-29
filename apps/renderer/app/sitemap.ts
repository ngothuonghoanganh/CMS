import type { MetadataRoute } from 'next';

import { getPublicRoutesForHostname } from './lib/page-api';
import { getRequestHostname, isPlatformHostname } from './lib/host';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = await getRequestHostname();
  if (!hostname || isPlatformHostname(hostname)) return [];

  const routes = await getPublicRoutesForHostname(hostname);
  return routes?.urls.map((url) => ({ url })) ?? [];
}

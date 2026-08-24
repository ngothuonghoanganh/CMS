import type { MetadataRoute } from 'next';

import { getPublicPageForHostname } from './lib/page-api';
import { getRequestHostname, isPlatformHostname } from './lib/host';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = await getRequestHostname();
  if (!hostname || isPlatformHostname(hostname)) return [];

  const page = await getPublicPageForHostname(hostname);
  if (!page || page.seo?.noIndex) return [];

  const url = page.canonicalUrl ?? `https://${hostname}/`;
  return [{ url }];
}

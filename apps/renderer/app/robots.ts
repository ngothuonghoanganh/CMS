import type { MetadataRoute } from 'next';

import { getPublicPageForHostname } from './lib/page-api';
import { getRequestHostname, isPlatformHostname } from './lib/host';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = await getRequestHostname();
  if (!hostname || isPlatformHostname(hostname)) {
    return {
      rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/preview/'] },
    };
  }

  const page = await getPublicPageForHostname(hostname);
  if (!page) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  const noIndex = page.seo?.noIndex === true;
  return {
    rules: {
      userAgent: '*',
      allow: noIndex ? undefined : '/',
      disallow: noIndex ? '/' : ['/api/', '/preview/'],
    },
    ...(noIndex ? {} : { sitemap: `https://${hostname}/sitemap.xml` }),
  };
}

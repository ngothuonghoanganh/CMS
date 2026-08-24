import type { Metadata } from 'next';
import type { PublicLandingPage } from '@payload/contracts';

import { getPlatformOrigin } from './host';

export function publicPageMetadata(
  page: PublicLandingPage,
  options: { fallbackPath?: string; preview?: boolean } = {},
): Metadata {
  const seo = page.seo;
  const title = seo?.title ?? page.payload.metadata.documentTitle;
  const description = seo?.description ?? page.payload.metadata.documentDescription;
  const fallbackCanonical = options.fallbackPath
    ? new URL(options.fallbackPath, getPlatformOrigin()).toString()
    : undefined;
  const canonical = page.canonicalUrl ?? fallbackCanonical;
  const index = options.preview ? false : seo?.noIndex ? false : true;
  const follow = options.preview ? false : seo?.noFollow ? false : true;
  const ogTitle = seo?.ogTitle ?? title;
  const ogDescription = seo?.ogDescription ?? description;
  const twitterTitle = seo?.twitterTitle ?? title;
  const twitterDescription = seo?.twitterDescription ?? description;
  const image = seo?.ogImage ?? seo?.twitterImage;

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    robots: { index, follow },
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      type: 'website',
      ...(title || ogTitle ? { title: ogTitle ?? title } : {}),
      ...(ogDescription ? { description: ogDescription } : {}),
      ...(canonical ? { url: canonical } : {}),
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: seo?.twitterCard ?? (image ? 'summary_large_image' : 'summary'),
      ...(twitterTitle ? { title: twitterTitle } : {}),
      ...(twitterDescription ? { description: twitterDescription } : {}),
      ...(seo?.twitterImage || image ? { images: [seo?.twitterImage ?? image!] } : {}),
    },
    ...(seo?.favicon ? { icons: { icon: seo.favicon } } : {}),
  };
}

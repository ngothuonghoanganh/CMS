import type { PublicPageData } from '@plp/contracts';
import type { Metadata } from 'next';

/** Head tags of a live page, all from the published release's resolved SEO (ADR-011). */
export function pageMetadata(data: PublicPageData): Metadata {
  const { seo } = data.page;
  const title = seo.title;
  const description = seo.description.trim() === '' ? null : seo.description;
  const image = seo.shareImage;
  const indexable = !seo.noindex;
  const describedBy = description === null ? {} : { description };
  return {
    title,
    description,
    alternates: { canonical: seo.canonicalUrl },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: 'website',
      locale: 'vi_VN',
      url: seo.canonicalUrl,
      siteName: data.site.name,
      title,
      ...describedBy,
      ...(image === null
        ? {}
        : { images: [{ url: image.url, width: image.width, height: image.height }] }),
    },
    twitter:
      image === null
        ? { card: 'summary', title, ...describedBy }
        : { card: 'summary_large_image', title, ...describedBy, images: [image.url] },
  };
}

/** A preview is never indexed or followed, whatever the page's own SEO says (ADR-010). */
export function previewMetadata(data: PublicPageData | null): Metadata {
  return {
    title: data === null ? 'Bản xem trước' : `Bản xem trước · ${data.page.seo.title}`,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

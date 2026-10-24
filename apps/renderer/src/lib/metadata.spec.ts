import type { PublicPageData, PublicSeo } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { pageMetadata, previewMetadata } from './metadata';

const SHARE_IMAGE = { url: 'http://cdn.test/public/share.jpg', width: 1200, height: 630 };

function pageData(seo: Partial<PublicSeo> = {}): PublicPageData {
  return {
    site: {
      id: 'a'.repeat(24),
      name: 'Nha khoa Smile Care',
      subdomain: 'smilecare',
      themePresetId: 'mint',
      logo: null,
      origin: 'https://smilecare.payload.site',
    },
    page: {
      id: 'b'.repeat(24),
      slug: 'nieng-rang',
      seo: {
        title: 'Niềng răng trong suốt — Smile Care',
        description: 'Tư vấn miễn phí cùng bác sĩ.',
        shareImage: SHARE_IMAGE,
        noindex: false,
        canonicalUrl: 'https://smilecare.payload.site/nieng-rang',
        ...seo,
      },
      composition: { version: 1, sections: [] },
    },
    assets: {},
    pageLinks: {},
  };
}

describe('pageMetadata', () => {
  it('maps title, description, canonical and an indexable robots rule', () => {
    const metadata = pageMetadata(pageData());
    expect(metadata.title).toBe('Niềng răng trong suốt — Smile Care');
    expect(metadata.description).toBe('Tư vấn miễn phí cùng bác sĩ.');
    expect(metadata.alternates).toEqual({ canonical: 'https://smilecare.payload.site/nieng-rang' });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('builds Open Graph with the site name and the share image size', () => {
    expect(pageMetadata(pageData()).openGraph).toEqual({
      type: 'website',
      locale: 'vi_VN',
      url: 'https://smilecare.payload.site/nieng-rang',
      siteName: 'Nha khoa Smile Care',
      title: 'Niềng răng trong suốt — Smile Care',
      description: 'Tư vấn miễn phí cùng bác sĩ.',
      images: [SHARE_IMAGE],
    });
  });

  it('uses a large Twitter card only when there is an image', () => {
    expect(pageMetadata(pageData()).twitter).toEqual({
      card: 'summary_large_image',
      title: 'Niềng răng trong suốt — Smile Care',
      description: 'Tư vấn miễn phí cùng bác sĩ.',
      images: [SHARE_IMAGE.url],
    });
    const withoutImage = pageMetadata(pageData({ shareImage: null }));
    expect(withoutImage.twitter).toEqual({
      card: 'summary',
      title: 'Niềng răng trong suốt — Smile Care',
      description: 'Tư vấn miễn phí cùng bác sĩ.',
    });
    expect(withoutImage.openGraph).not.toHaveProperty('images');
  });

  it('honours noindex', () => {
    expect(pageMetadata(pageData({ noindex: true })).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it('leaves out an empty description', () => {
    const metadata = pageMetadata(pageData({ description: '  ' }));
    expect(metadata.description).toBeNull();
    expect(metadata.openGraph).not.toHaveProperty('description');
    expect(metadata.twitter).not.toHaveProperty('description');
  });
});

describe('previewMetadata', () => {
  it('is never indexable, even for an indexable page', () => {
    const metadata = previewMetadata(pageData());
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
    expect(metadata.title).toBe('Bản xem trước · Niềng răng trong suốt — Smile Care');
  });

  it('has a neutral title when there is no preview', () => {
    expect(previewMetadata(null)).toMatchObject({
      title: 'Bản xem trước',
      robots: { index: false, follow: false },
    });
  });
});

import type { PublicPageData } from '@plp/contracts';
import { createSectionInstance } from '@plp/sections/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const events: string[] = [];

vi.mock('next/server', () => ({
  connection: () => {
    events.push('connection');
    return Promise.resolve();
  },
}));
vi.mock('../../lib/request-host', () => ({
  currentSubdomain: () => Promise.resolve('smilecare'),
  currentLiveRelease: () => Promise.resolve('d'.repeat(24)),
}));
vi.mock('../../lib/public-api', () => ({
  getResolved: () => Promise.resolve({ kind: 'page', data: livePage() }),
}));

const { default: PublicPage } = await import('./page');

function livePage(): PublicPageData {
  return {
    site: {
      id: 'a'.repeat(24),
      name: 'Smile Care',
      subdomain: 'smilecare',
      themePresetId: 'mint',
      logo: null,
      origin: 'http://smilecare.localhost:3101',
    },
    page: {
      id: 'b'.repeat(24),
      slug: 'uu-dai',
      seo: {
        title: 'Smile Care',
        description: '',
        shareImage: null,
        noindex: false,
        canonicalUrl: 'http://smilecare.localhost:3101/uu-dai',
      },
      composition: {
        version: 1,
        sections: [
          createSectionInstance('navbar', undefined, 'section00001'),
          createSectionInstance('lead_form', undefined, 'section00002'),
          createSectionInstance('footer', undefined, 'section00003'),
        ],
      },
    },
    assets: {},
    pageLinks: {},
    releaseId: 'd'.repeat(24),
    leadCapture: {
      requiredText: 'Tôi đồng ý để Smile Care liên hệ tư vấn.',
      marketingText: null,
      policyUrl: 'https://smilecare.vn/chinh-sach',
    },
  };
}

afterEach(() => {
  events.length = 0;
  vi.restoreAllMocks();
});

describe('the public page', () => {
  // Next 16 (cacheComponents) prerenders whatever comes before a request-time access, and logs
  // an error for a random value met there: the form's submission id must come after one.
  it('draws the form’s submission id at request time', async () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      events.push('submission id');
      return '0b0f5b9e-6a3e-4d6c-9a52-3d1f0c2b7a11';
    });
    const page = await PublicPage({
      params: Promise.resolve({ slug: ['uu-dai'] }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('value="0b0f5b9e-6a3e-4d6c-9a52-3d1f0c2b7a11"');
    expect(events).toEqual(['connection', 'submission id']);
  });
});

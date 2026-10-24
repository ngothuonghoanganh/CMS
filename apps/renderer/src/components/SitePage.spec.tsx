import type { PublicPageData } from '@plp/contracts';
import { MAIN_CONTENT_ID } from '@plp/sections/react';
import { createSectionInstance } from '@plp/sections/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { liveRenderContext, SitePage } from './SitePage';

const LOGO = { url: 'http://cdn.test/public/logo.png', width: 320, height: 80 };

function pageData(): PublicPageData {
  let next = 0;
  const newId = () => `section${String(++next).padStart(4, '0')}`;
  return {
    site: {
      id: 'a'.repeat(24),
      name: 'Smile Care',
      subdomain: 'smilecare',
      themePresetId: 'mint',
      logo: LOGO,
      origin: 'http://smilecare.localhost:3101',
    },
    page: {
      id: 'b'.repeat(24),
      slug: '',
      seo: {
        title: 'Smile Care',
        description: '',
        shareImage: null,
        noindex: false,
        canonicalUrl: 'http://smilecare.localhost:3101/',
      },
      composition: {
        version: 1,
        sections: [
          createSectionInstance('navbar', undefined, newId()),
          createSectionInstance('hero', undefined, newId()),
          createSectionInstance('footer', undefined, newId()),
        ],
      },
    },
    assets: {},
    pageLinks: { ['c'.repeat(24)]: '/uu-dai' },
  };
}

describe('liveRenderContext', () => {
  it('renders published data in live mode, without any editing hook', () => {
    const data = pageData();
    expect(liveRenderContext(data)).toEqual({
      mode: 'live',
      site: { name: 'Smile Care', logo: LOGO },
      images: {},
      pagePaths: { ['c'.repeat(24)]: '/uu-dai' },
    });
  });
});

describe('SitePage', () => {
  it('draws the page with header, main (skip-link target) and footer landmarks', () => {
    const html = renderToStaticMarkup(<SitePage data={pageData()} />);
    expect(html).toContain('<header');
    expect(html).toContain(`<main id="${MAIN_CONTENT_ID}">`);
    expect(html).toContain('<footer');
    expect(html).not.toContain('contenteditable');
  });
});

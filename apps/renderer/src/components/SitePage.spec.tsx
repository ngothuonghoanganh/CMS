import { type PublicPageData, submissionIdSchema } from '@plp/contracts';
import { MAIN_CONTENT_ID } from '@plp/sections/react';
import { createSectionInstance } from '@plp/sections/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { liveRenderContext, SitePage } from './SitePage';

const LOGO = { url: 'http://cdn.test/public/logo.png', width: 320, height: 80 };
const RELEASE_ID = 'd'.repeat(24);
const CAPTURE = {
  requiredText: 'Tôi đồng ý để Smile Care liên hệ tư vấn.',
  marketingText: null,
  policyUrl: 'https://smilecare.vn/chinh-sach',
};

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
    releaseId: RELEASE_ID,
    leadCapture: CAPTURE,
  };
}

function withForm(data: PublicPageData): PublicPageData {
  const sections = data.page.composition.sections;
  return {
    ...data,
    page: {
      ...data.page,
      composition: {
        version: 1,
        sections: [
          ...sections.slice(0, -1),
          createSectionInstance('lead_form', undefined, 'form00000001'),
          ...sections.slice(-1),
        ],
      },
    },
  };
}

describe('liveRenderContext', () => {
  it('renders published data in live mode, without any editing hook', () => {
    const { leadSubmission, ...rest } = liveRenderContext(pageData(), 'live');
    expect(rest).toEqual({
      mode: 'live',
      site: { name: 'Smile Care', logo: LOGO },
      images: {},
      pagePaths: { ['c'.repeat(24)]: '/uu-dai' },
      leadCapture: CAPTURE,
    });
    // A live page sends its form with the release it shows.
    expect(leadSubmission?.releaseId).toBe(RELEASE_ID);
  });

  // Without JavaScript the form can only send what the server drew into it; the API takes a
  // second send of the same id as a replay (ADR-016).
  it('draws a new valid submission id for every page served', () => {
    const first = liveRenderContext(pageData(), 'live').leadSubmission?.submissionId;
    const second = liveRenderContext(pageData(), 'live').leadSubmission?.submissionId;
    expect(submissionIdSchema.safeParse(first).success).toBe(true);
    expect(submissionIdSchema.safeParse(second).success).toBe(true);
    expect(first).not.toBe(second);
  });

  it('never lets a preview send its form', () => {
    expect(liveRenderContext(pageData(), 'off')).not.toHaveProperty('leadSubmission');
    expect(liveRenderContext({ ...pageData(), releaseId: null }, 'live')).not.toHaveProperty(
      'leadSubmission',
    );
  });
});

describe('SitePage', () => {
  it('draws the page with header, main (skip-link target) and footer landmarks', () => {
    const html = renderToStaticMarkup(<SitePage data={pageData()} submission="live" />);
    expect(html).toContain('<header');
    expect(html).toContain(`<main id="${MAIN_CONTENT_ID}">`);
    expect(html).toContain('<footer');
    expect(html).not.toContain('contenteditable');
  });

  it('server-renders a live form that posts to /_lead without JavaScript', () => {
    const html = renderToStaticMarkup(<SitePage data={withForm(pageData())} submission="live" />);
    expect(html).toContain('action="/_lead"');
    expect(html).toContain(`value="${RELEASE_ID}"`);
    const submissionId = /name="submissionId" value="([^"]+)"/.exec(html)?.[1];
    expect(submissionIdSchema.safeParse(submissionId).success).toBe(true);
    expect(html).toContain('Tôi đồng ý để Smile Care liên hệ tư vấn.');
    expect(html).not.toContain('checked');
  });

  it('links the privacy policy from the footer of a page with a form, opening a new tab', () => {
    const html = renderToStaticMarkup(<SitePage data={withForm(pageData())} submission="live" />);
    const footer = html.slice(html.indexOf('<footer'));
    expect(footer).toMatch(
      /<a class="[^"]+" href="https:\/\/smilecare\.vn\/chinh-sach" target="_blank" rel="noopener noreferrer">Chính sách quyền riêng tư<\/a>/,
    );
    // The API sends consent texts with a form only (ADR-017): without them, no automatic link.
    const plain = renderToStaticMarkup(
      <SitePage data={{ ...pageData(), leadCapture: null }} submission="live" />,
    );
    expect(plain.slice(plain.indexOf('<footer'))).not.toContain('Chính sách quyền riêng tư');
  });

  it('draws the steps, partner logos, before and after and quick contact as published', () => {
    const data = pageData();
    const asset = 'e'.repeat(24);
    const logo = { assetId: asset, alt: 'Bệnh viện Hòa Bình', decorative: false };
    const logos = createSectionInstance('logos', 'row', 'logos0000001');
    const pair = createSectionInstance('before_after', 'side_by_side', 'pair00000001');
    const quick = createSectionInstance('quick_contact', 'buttons', 'quick0000001');
    const sections = [
      ...data.page.composition.sections.slice(0, -1),
      createSectionInstance('benefits', 'steps', 'steps0000001'),
      {
        ...logos,
        content: { ...logos.content, items: [{ image: logo }, { image: logo }, { image: logo }] },
      },
      {
        ...pair,
        content: {
          ...pair.content,
          beforeImage: { assetId: asset, alt: 'Trước khi niềng', decorative: false },
          afterImage: { assetId: asset, alt: 'Sau 12 tháng', decorative: false },
        },
      },
      {
        ...quick,
        content: {
          ...quick.content,
          call: { label: 'Gọi ngay', link: { kind: 'phone', phone: '0901 234 567' } },
          zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '0901 234 567' } },
        },
      },
      ...data.page.composition.sections.slice(-1),
    ];
    const html = renderToStaticMarkup(
      <SitePage
        data={{
          ...data,
          page: { ...data.page, composition: { version: 1, sections } },
          assets: { [asset]: { url: 'http://cdn.test/public/logo.png', width: 400, height: 160 } },
        }}
        submission="live"
      />,
    );
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    expect(main).toContain('<ol');
    expect(main.split('alt="Bệnh viện Hòa Bình"')).toHaveLength(4);
    expect(main.indexOf('alt="Trước khi niềng"')).toBeLessThan(main.indexOf('alt="Sau 12 tháng"'));
    expect(main.split('<figcaption')).toHaveLength(3);
    expect(main).toContain('href="tel:0901234567"');
    expect(main).toContain('href="https://zalo.me/0901234567"');
  });

  it('renders a preview form that cannot send', () => {
    const html = renderToStaticMarkup(<SitePage data={withForm(pageData())} submission="off" />);
    expect(html).not.toContain('action=');
    expect(html).not.toContain('name="submissionId"');
    expect(html).toContain('Bản xem trước: form không gửi đi.');
  });
});

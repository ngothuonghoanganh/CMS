// @vitest-environment node
import {
  type Composition,
  type Cta,
  type Link,
  type PublicImage,
  type SectionInstance,
  type SectionType,
  sectionTypes,
} from '@plp/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FieldDescriptor, LeafField } from '../schema/define.js';
import { setAtPath } from '../schema/paths.js';
import { collectLeaves, createSectionInstance, getSectionDefinition } from '../schema/registry.js';
import { type LeadFormContent, leadFormContentSchema } from '../schema/sections/lead-form.js';
import { themePresets } from '../schema/themes.js';
import type { RenderContext } from './context.js';
import type { LeadFormViewProps } from './lead-form-view.js';
import frame from './frame.module.css';
import { LeadFormSent, LeadFormView } from './lead-form-view.js';
import { MAIN_CONTENT_ID, PageView } from './PageView.js';
import { renderSectionContent } from './render.js';
import { SectionFrame } from './SectionFrame.js';
import benefitsStyles from './sections/Benefits.module.css';
import heroStyles from './sections/Hero.module.css';

const ASSET_ID = 'a1'.repeat(12);
const PAGE_ID = 'b2'.repeat(12);
const IMAGE: PublicImage = {
  url: 'https://cdn.example.com/public/photo.webp',
  width: 1200,
  height: 900,
};
const LOGO: PublicImage = {
  url: 'https://cdn.example.com/public/logo.png',
  width: 320,
  height: 80,
};

function liveCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    mode: 'live',
    site: { name: 'Smile Care', logo: null },
    images: { [ASSET_ID]: IMAGE },
    pagePaths: {},
    leadCapture: null,
    ...overrides,
  };
}

function editCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return liveCtx({ mode: 'edit', onTextChange: () => undefined, ...overrides });
}

let nextId = 0;
function section(type: SectionType, variant?: string): SectionInstance {
  nextId += 1;
  return createSectionInstance(type, variant, `sec${String(nextId).padStart(8, '0')}`);
}

function withContent(target: SectionInstance, path: string, value: unknown): SectionInstance {
  return { ...target, content: setAtPath(target.content, path, value) };
}

function render(target: SectionInstance, ctx: RenderContext): string {
  return renderToStaticMarkup(
    <SectionFrame section={target} theme={themePresets.mint}>
      {renderSectionContent(target, ctx)}
    </SectionFrame>,
  );
}

function sampleLeadForm(target: SectionInstance): LeadFormContent {
  return leadFormContentSchema.parse(target.content);
}

/** A CSS Module class name; fails loudly instead of comparing against `undefined`. */
function cls(name: string | undefined): string {
  if (!name) {
    throw new Error('Missing CSS Module class');
  }
  return name;
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

const variants = sectionTypes.flatMap((type) =>
  getSectionDefinition(type).variants.map((variant) => ({
    type,
    variant: variant.id,
    info: variant,
  })),
);

/** Applies `change` to every leaf field (top level and inside list items) of a section. */
function mapLeaves(
  target: SectionInstance,
  change: (field: LeafField, path: string, value: unknown) => unknown,
): SectionInstance {
  let next = target;
  const fields: readonly FieldDescriptor[] = getSectionDefinition(target.type).fields;
  for (const field of fields) {
    if (field.kind !== 'list') {
      next = withContent(next, field.key, change(field, field.key, next.content[field.key]));
      continue;
    }
    const items = next.content[field.key];
    if (!Array.isArray(items)) {
      continue;
    }
    items.forEach((_item, index) => {
      for (const itemField of field.itemFields) {
        const path = `${field.key}.${index}.${itemField.key}`;
        const current: unknown = (next.content[field.key] as unknown[])[index];
        const value =
          current !== null && typeof current === 'object'
            ? (current as Record<string, unknown>)[itemField.key]
            : undefined;
        next = withContent(next, path, change(itemField, path, value));
      }
    });
  }
  return next;
}

/** Empties every optional text and optional button label, leaving required ones untouched. */
function emptyOptional(target: SectionInstance, includeCtas: boolean): SectionInstance {
  return mapLeaves(target, (field, _path, value) => {
    if (field.required) {
      return value;
    }
    if (field.kind === 'text') {
      return '';
    }
    if (field.kind === 'cta' && includeCtas) {
      return { label: '', link: { kind: 'none' } };
    }
    return value;
  });
}

/** How React serializes the editable text of the canvas. */
const EDITABLE = 'contentEditable="plaintext-only"';

const EMPTY_ELEMENT =
  /<(h1|h2|h3|p|cite|span|a|li|ul|summary|blockquote|address|figcaption|figure)(\s[^>]*)?><\/\1>/;

describe('section components', () => {
  it.each(variants)('renders $type · $variant from sample content', ({ type, variant }) => {
    const target = section(type, variant);
    const live = render(target, liveCtx());
    const edit = render(target, editCtx());
    expect(live).toContain(`id="section-${target.id}"`);
    expect(live).not.toContain('contentEditable');
    expect(live).not.toContain('Nội dung section không hợp lệ');
    expect(edit).toContain(EDITABLE);
    expect(edit).not.toContain('<a ');
  });

  it.each(variants)(
    'omits empty optional texts and unused buttons of $type · $variant in live mode',
    ({ type, variant }) => {
      const target = emptyOptional(section(type, variant), true);
      const live = render(target, liveCtx());
      expect(live).not.toMatch(EMPTY_ELEMENT);
      expect(live).not.toContain(cls(frame.buttonSecondary));
      if (type === 'navbar') {
        expect(live).not.toContain(cls(frame.button));
      }
    },
  );

  it.each(variants)(
    'keeps empty optional texts of $type · $variant editable in edit mode',
    ({ type, variant }) => {
      const target = section(type, variant);
      const full = render(target, editCtx());
      const emptied = render(emptyOptional(target, false), editCtx());
      expect(count(emptied, EDITABLE)).toBe(count(full, EDITABLE));
      expect(count(full, EDITABLE)).toBeGreaterThan(0);
    },
  );

  it.each(variants.filter(({ info }) => (info.hiddenFields ?? []).length > 0))(
    'never renders the hidden fields of $type · $variant',
    ({ type, variant, info }) => {
      const forbidden: string[] = [];
      const hidden = new Set(info.hiddenFields);
      const marked = mapLeaves(section(type, variant), (field, path, value) => {
        const key = path.replace(/\.\d+\./, '.');
        if (!hidden.has(key)) {
          return value;
        }
        switch (field.kind) {
          case 'text':
            forbidden.push('HIDDEN-TEXT');
            return 'HIDDEN-TEXT';
          case 'cta':
            forbidden.push('HIDDEN-CTA');
            return { label: 'HIDDEN-CTA', link: { kind: 'none' } };
          case 'image':
            forbidden.push(IMAGE.url, 'Chưa chọn ảnh');
            return { assetId: ASSET_ID, alt: 'HIDDEN-ALT', decorative: false };
          case 'select':
            // The only select is the benefit icon, drawn as an inline SVG.
            forbidden.push('<svg');
            return value;
          case 'boolean':
            return value;
        }
      });
      expect(forbidden.length).toBeGreaterThan(0);
      for (const ctx of [liveCtx(), editCtx()]) {
        const markup = render(marked, ctx);
        for (const needle of forbidden) {
          expect(markup).not.toContain(needle);
        }
      }
    },
  );

  it('orders media first on mobile only for variants that show media in the flow', () => {
    const mediaFirstClasses: Record<string, string> = {
      'hero:split': cls(heroStyles.mediaFirst),
      'benefits:alternate': cls(benefitsStyles.mediaFirst),
    };
    for (const { type, variant, info } of variants) {
      const target = section(type, variant);
      const auto = render(target, liveCtx());
      const mediaFirst = render({ ...target, mobileOrder: 'media-first' }, liveCtx());
      const expectedClass = mediaFirstClasses[`${type}:${variant}`];
      if (expectedClass) {
        expect(info.hasMedia).toBe(true);
        expect(mediaFirst).toContain(expectedClass);
        expect(auto).not.toContain(expectedClass);
      } else {
        // Without media (or with a background image behind the text) there is nothing to reorder.
        expect(mediaFirst).toBe(auto);
        expect(info.hasMedia && variant !== 'background').toBe(false);
      }
    }
  });

  it('escapes text that looks like markup', () => {
    const payload = '<script>alert(1)</script>';
    for (const { type, variant } of variants) {
      const target = mapLeaves(section(type, variant), (field, _path, value) =>
        field.kind === 'text' ? payload : value,
      );
      expect(collectLeaves(target).some((leaf) => leaf.value === payload)).toBe(true);
      for (const ctx of [liveCtx(), liveCtx({ mode: 'edit' })]) {
        const markup = render(target, ctx);
        expect(markup).not.toContain('<script');
        expect(markup).toContain('&lt;script&gt;');
      }
    }
  });
});

describe('links', () => {
  function bandWith(link: Link, label = 'Gọi ngay'): SectionInstance {
    return withContent(section('cta_band'), 'cta', { label, link } satisfies Cta);
  }

  it('links to a section of the page', () => {
    const markup = render(bandWith({ kind: 'section', sectionId: 'abc12345' }), liveCtx());
    expect(markup).toContain('href="#section-abc12345"');
    expect(markup).not.toContain('target=');
  });

  it('calls a phone number', () => {
    const markup = render(bandWith({ kind: 'phone', phone: '0901 234 567' }), liveCtx());
    expect(markup).toContain('href="tel:0901234567"');
  });

  it('renders a link to a page that is not live as plain text', () => {
    const target = bandWith({ kind: 'page', pageId: PAGE_ID });
    const markup = render(target, liveCtx());
    expect(markup).not.toContain('href=');
    expect(markup).toContain('>Gọi ngay</span>');
    expect(render(target, liveCtx({ pagePaths: { [PAGE_ID]: '/uu-dai' } }))).toContain(
      'href="/uu-dai"',
    );
  });

  it('opens external links in a new tab without an opener', () => {
    const markup = render(
      bandWith({ kind: 'url', url: 'https://example.com/bang-gia' }),
      liveCtx(),
    );
    expect(markup).toContain('href="https://example.com/bang-gia"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it('never navigates in edit mode', () => {
    const markup = render(bandWith({ kind: 'url', url: 'https://example.com' }), editCtx());
    expect(markup).not.toContain('href=');
  });

  it('draws footer links as small text links that resolve the same way', () => {
    const target = withContent(section('footer'), 'links', [
      { link: { label: 'Chính sách quyền riêng tư', link: { kind: 'page', pageId: PAGE_ID } } },
      { link: { label: 'Zalo', link: { kind: 'zalo', phone: '0901234567' } } },
      { link: { label: '', link: { kind: 'none' } } },
    ]);
    const markup = render(target, liveCtx({ pagePaths: { [PAGE_ID]: '/chinh-sach' } }));
    expect(markup).toContain('href="/chinh-sach"');
    expect(markup).toContain('href="https://zalo.me/0901234567"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(count(markup, cls(frame.textLink))).toBe(2);
    expect(markup).not.toContain(cls(frame.buttonPrimary));
    expect(count(markup, '<li')).toBe(2);
  });
});

describe('images', () => {
  it('keeps the size of an image and its alt text', () => {
    const target = withContent(section('hero', 'split'), 'image', {
      assetId: ASSET_ID,
      alt: 'Bác sĩ tư vấn cho khách hàng',
      decorative: false,
    });
    const markup = render(target, liveCtx());
    expect(markup).toContain(`src="${IMAGE.url}"`);
    expect(markup).toContain('width="1200"');
    expect(markup).toContain('height="900"');
    expect(markup).toContain('alt="Bác sĩ tư vấn cho khách hàng"');
  });

  it('gives a decorative image an empty alt', () => {
    const target = withContent(section('benefits', 'alternate'), 'items.0.image', {
      assetId: ASSET_ID,
      alt: 'Không dùng',
      decorative: true,
    });
    const markup = render(target, liveCtx());
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain('Không dùng');
  });

  it('shows a placeholder for a missing image only in edit mode', () => {
    const target = section('benefits', 'alternate');
    expect(render(target, editCtx())).toContain('Chưa chọn ảnh');
    expect(render(target, liveCtx())).not.toContain('Chưa chọn ảnh');
  });
});

describe('section specifics', () => {
  it('shows the site logo or the brand text in the navigation bar', () => {
    const navbar = section('navbar');
    const withLogo = render(navbar, liveCtx({ site: { name: 'Smile Care', logo: LOGO } }));
    expect(withLogo).toContain(`src="${LOGO.url}"`);
    expect(withLogo).toContain('alt="Smile Care"');

    const noLogo = render(
      withContent(navbar, 'showLogo', false),
      liveCtx({ site: { name: 'Smile Care', logo: LOGO } }),
    );
    expect(noLogo).not.toContain('<img');
    expect(noLogo).toContain('>Smile Care</span>');

    const branded = render(withContent(navbar, 'brandText', 'Nha khoa SC'), liveCtx());
    expect(branded).toContain('>Nha khoa SC</span>');
    expect(branded).toContain('>Đặt lịch</span>');
  });

  it('turns the Hero background text, buttons and focus rings white only over a chosen photo', () => {
    const hero = withContent(section('hero', 'background'), 'secondaryCta', {
      label: 'Xem bảng giá',
      link: { kind: 'url', url: 'https://smile.example/bang-gia' },
    });
    // No photo yet: the edit placeholder keeps the scheme colors and gets no dark overlay.
    const placeholder = render(hero, editCtx());
    expect(placeholder).toContain('Chọn ảnh nền trong bảng thuộc tính');
    expect(placeholder).not.toContain(cls(heroStyles.overPhoto));
    expect(placeholder).not.toContain(cls(heroStyles.ctaOverPhoto));

    const photo = render(
      withContent(hero, 'image', { assetId: ASSET_ID, alt: 'Phòng khám', decorative: false }),
      liveCtx(),
    );
    expect(photo).toContain(cls(heroStyles.overPhoto));
    expect(count(photo, cls(heroStyles.ctaOverPhoto))).toBe(2);
    expect(photo).toMatch(
      new RegExp(
        `<a class="[^"]*${cls(frame.buttonSecondary)}[^"]*${cls(heroStyles.secondaryOverPhoto)}`,
      ),
    );

    // The split variant shows the photo beside the text: no overlay colors there.
    const split = render(
      withContent(section('hero', 'split'), 'image', {
        assetId: ASSET_ID,
        alt: 'Ảnh',
        decorative: false,
      }),
      liveCtx(),
    );
    expect(split).not.toContain(cls(heroStyles.overPhoto));
  });

  it('draws one decorative icon per benefit in a list', () => {
    const markup = render(section('benefits', 'grid'), liveCtx());
    expect(count(markup, '<li')).toBe(3);
    expect(count(markup, '<svg')).toBe(3);
    expect(count(markup, '<span class="_icon_')).toBe(3);
    expect(count(markup, 'aria-hidden="true"')).toBe(3);
    expect(count(markup, '<h3')).toBe(3);
    expect(markup).toContain('<h2');
  });

  it('marks testimonials up as quotes with their author', () => {
    const cards = render(section('testimonials', 'cards'), liveCtx());
    expect(count(cards, '<blockquote')).toBe(3);
    expect(count(cards, '<figcaption')).toBe(3);
    expect(count(cards, '<cite')).toBe(3);
    expect(cards).toContain('<h2');

    const featured = section('testimonials', 'quote');
    const quote = render(featured, liveCtx());
    expect(count(quote, '<blockquote')).toBe(1);
    expect(quote).toContain('>Cảm nhận khách hàng</h2>');
    expect(quote).toContain('Nhận xét ngắn, cụ thể về kết quả khách hàng nhận được.');
    expect(quote).not.toContain('Một nhận xét khác');
    expect(quote).toContain(' · ');
    expect(render(withContent(featured, 'items.0.detail', ''), liveCtx())).not.toContain(' · ');
  });

  it('uses details and summary for the FAQ, and open blocks while editing', () => {
    const faq = section('faq');
    const live = render(faq, liveCtx());
    expect(count(live, '<details')).toBe(3);
    expect(count(live, '<summary')).toBe(3);
    expect(count(live, '<h3')).toBe(3);
    const edit = render(faq, editCtx());
    expect(edit).not.toContain('<details');
    expect(edit).not.toContain('<summary');
    expect(count(edit, '<h3')).toBe(3);
    const unfinished = render(withContent(faq, 'items.1.question', ''), liveCtx());
    expect(count(unfinished, '<details')).toBe(2);
  });

  it('shows the footer contact details with a callable phone number', () => {
    const footer = withContent(
      withContent(section('footer'), 'phone', '0901 234 567'),
      'copyright',
      '© 2026 Smile Care',
    );
    const markup = render(footer, liveCtx());
    expect(markup).toContain('<address');
    expect(markup).toContain('href="tel:0901234567"');
    expect(markup).toContain('>0901 234 567</a>');
    expect(markup).toContain('>Smile Care</p>');
    expect(markup).toContain('© 2026 Smile Care');

    const sample = render(section('footer'), liveCtx());
    expect(sample).not.toContain('tel:');
    expect(sample).toContain('Số điện thoại');
    expect(render(footer, editCtx())).not.toContain('tel:');
  });
});

describe('lead form', () => {
  const CAPTURE = {
    requiredText: 'Tôi đồng ý để Smile Care xử lý họ tên và số điện thoại của tôi.',
    marketingText: 'Nhận ưu đãi qua Zalo',
    policyUrl: 'https://smilecare.vn/chinh-sach',
  };
  const RELEASE_ID = 'c3'.repeat(12);

  it('posts a plain form to /_lead with the release the visitor sees', () => {
    const form = section('lead_form');
    const markup = render(
      form,
      liveCtx({
        leadCapture: CAPTURE,
        leadSubmission: { releaseId: RELEASE_ID, render: () => 'interactive form' },
      }),
    );
    // A host with an interactive form renders it instead of the plain view.
    expect(markup).toContain('interactive form');

    const plain = renderToStaticMarkup(
      <LeadFormView
        sectionId={form.id}
        content={sampleLeadForm(form)}
        capture={CAPTURE}
        releaseId={RELEASE_ID}
      />,
    );
    expect(plain).toContain('<form');
    expect(plain).toContain('method="post"');
    expect(plain).toContain('action="/_lead"');
    expect(plain).toContain(`name="releaseId" value="${RELEASE_ID}"`);
    // The honeypot: out of the tab order, whatever the attribute order.
    expect(plain).toMatch(/<input(?=[^>]*name="website")(?=[^>]*tabindex="-1")[^>]*>/);
    expect(plain).toContain('href="https://smilecare.vn/chinh-sach"');
    expect(plain).toContain('Nhận ưu đãi qua Zalo');
    // The consent box is never ticked in advance (rule 10).
    expect(plain).not.toContain('checked');
    expect(plain).not.toContain('disabled');
    expect(count(plain, '<h2')).toBe(1);
    expect(plain).not.toContain('<h1');
  });

  it('hands the interactive form exactly what the plain view needs', () => {
    const form = section('lead_form');
    const seen: LeadFormViewProps[] = [];
    render(
      form,
      liveCtx({
        leadCapture: CAPTURE,
        leadSubmission: {
          releaseId: RELEASE_ID,
          render: (view) => {
            seen.push(view);
            return null;
          },
        },
      }),
    );
    expect(seen).toEqual([
      {
        sectionId: form.id,
        content: sampleLeadForm(form),
        capture: CAPTURE,
        releaseId: RELEASE_ID,
      },
    ]);
  });

  it('keeps the send button focusable while sending, so a refusal finds the visitor on it', () => {
    const form = section('lead_form');
    const sending = renderToStaticMarkup(
      <LeadFormView
        sectionId={form.id}
        content={sampleLeadForm(form)}
        capture={CAPTURE}
        releaseId={RELEASE_ID}
        submitting
      />,
    );
    expect(sending).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*aria-disabled="true")[^>]*>/);
    expect(sending).toContain('aria-busy="true"');
    expect(sending).not.toContain('disabled=""');
  });

  it('confirms a sent lead in the section, with a decorative tick', () => {
    const markup = renderToStaticMarkup(
      <LeadFormSent content={sampleLeadForm(section('lead_form'))} />,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toMatch(/<span[^>]*aria-hidden="true"[^>]*><svg/);
    expect(markup).toContain('<h2 tabindex="-1"');
    expect(markup).toContain('Đã nhận đăng ký của bạn');
  });

  it('cannot send from a preview', () => {
    const markup = render(section('lead_form'), liveCtx({ leadCapture: CAPTURE }));
    expect(markup).not.toContain('action=');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Bản xem trước: form không gửi đi.');
  });

  it('asks email and a message only when they are turned on', () => {
    const base = section('lead_form');
    const plain = render(base, liveCtx({ leadCapture: CAPTURE }));
    expect(plain).not.toContain('name="email"');
    expect(plain).not.toContain('name="message"');
    const full = render(
      withContent(withContent(base, 'showEmail', true), 'showMessage', true),
      liveCtx({ leadCapture: CAPTURE }),
    );
    expect(full).toContain('name="email"');
    expect(full).toContain('<textarea');
    expect(full).toContain('(không bắt buộc)');
  });

  it('draws the form on the canvas without controls or links', () => {
    const edit = render(section('lead_form'), editCtx({ leadCapture: CAPTURE }));
    expect(edit).not.toContain('<form');
    expect(edit).not.toContain('<input');
    expect(edit).not.toContain('<a ');
    expect(edit).toContain('Chính sách quyền riêng tư');
    expect(render(section('lead_form'), editCtx())).toContain('chưa được thiết lập');
  });
});

describe('PageView', () => {
  function page(types: readonly SectionType[]): Composition {
    return { version: 1, sections: types.map((type) => section(type)) };
  }

  function sectionIndex(markup: string, target: SectionInstance | undefined): number {
    if (!target) {
      throw new Error('Missing section');
    }
    return markup.indexOf(`id="section-${target.id}"`);
  }

  it('puts the navigation bar in <header>, the body in <main> and the footer in <footer>', () => {
    const composition = page(['navbar', 'hero', 'benefits', 'faq', 'footer']);
    const [navbar, hero, , faq, footer] = composition.sections;
    const markup = renderToStaticMarkup(
      <PageView composition={composition} themePresetId="mint" ctx={liveCtx()} />,
    );
    const mainStart = markup.indexOf(`<main id="${MAIN_CONTENT_ID}">`);
    const mainEnd = markup.indexOf('</main>');
    expect(markup.indexOf('<header')).toBeLessThan(sectionIndex(markup, navbar) + 1);
    expect(sectionIndex(markup, navbar)).toBeLessThan(markup.indexOf('</header>'));
    expect(markup.indexOf('</header>')).toBeLessThan(mainStart);
    expect(mainStart).toBeLessThan(sectionIndex(markup, hero));
    expect(sectionIndex(markup, faq)).toBeLessThan(mainEnd);
    expect(mainEnd).toBeLessThan(markup.indexOf('<footer'));
    expect(markup.indexOf('<footer')).toBeLessThan(sectionIndex(markup, footer) + 1);
    expect(count(markup, '<h1')).toBe(1);
  });

  it('has a single h1 even with every section type on the page', () => {
    const markup = renderToStaticMarkup(
      <PageView composition={page(sectionTypes)} themePresetId="sunset" ctx={liveCtx()} />,
    );
    expect(count(markup, '<h1')).toBe(1);
    expect(count(markup, '<header')).toBe(1);
    expect(count(markup, '<footer')).toBe(1);
  });

  it('avoids a nested <main> on the admin canvas', () => {
    const markup = renderToStaticMarkup(
      <PageView
        composition={page(['navbar', 'hero', 'footer'])}
        themePresetId="mint"
        ctx={editCtx()}
      />,
    );
    expect(markup).not.toContain('<main');
  });

  it('applies the per-device visibility classes', () => {
    const hero = section('hero');
    const desktopHidden = render(
      { ...hero, visibility: { desktop: false, mobile: true } },
      liveCtx(),
    );
    expect(desktopHidden).toContain(cls(frame.hideDesktop));
    expect(desktopHidden).not.toContain(cls(frame.hideMobile));
    const mobileHidden = render(
      { ...hero, visibility: { desktop: true, mobile: false } },
      liveCtx(),
    );
    expect(mobileHidden).toContain(cls(frame.hideMobile));
    expect(mobileHidden).not.toContain(cls(frame.hideDesktop));
    const visible = render(hero, liveCtx());
    expect(visible).not.toContain(cls(frame.hideMobile));
    expect(visible).not.toContain(cls(frame.hideDesktop));
  });
});

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
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FieldDescriptor, LeafField } from '../schema/define.js';
import { setAtPath } from '../schema/paths.js';
import { collectLeaves, createSectionInstance, getSectionDefinition } from '../schema/registry.js';
import { type LeadFormContent, leadFormContentSchema } from '../schema/sections/lead-form.js';
import { themePresets } from '../schema/themes.js';
import type { RenderContext } from './context.js';
import type { LeadFormViewProps } from './lead-form-view.js';
import frame from './frame.module.css';
import { LEAD_SUBMISSION_FIELD, LeadFormSent, LeadFormView } from './lead-form-view.js';
import { MAIN_CONTENT_ID, PageView } from './PageView.js';
import { renderSectionContent } from './render.js';
import { SectionFrame } from './SectionFrame.js';
import benefitsStyles from './sections/Benefits.module.css';
import heroStyles from './sections/Hero.module.css';
import logosStyles from './sections/Logos.module.css';
import quickContactStyles from './sections/QuickContact.module.css';

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

  it('has a component for every section type', () => {
    // The result leaves out `undefined`: a switch that misses a type falls off its end, which
    // fails to compile.
    expectTypeOf(renderSectionContent).returns.toEqualTypeOf<ReactElement | null>();
    for (const type of sectionTypes) {
      expect(renderSectionContent(section(type), liveCtx()), type).not.toBeNull();
    }
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
        // Without media (or with a background image behind the text) there is nothing to reorder,
        // so the editor does not offer the setting (`hasMedia`).
        expect(mediaFirst).toBe(auto);
        expect(info.hasMedia, `${type}:${variant}`).toBe(false);
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

describe('image loading', () => {
  const PHOTO = { assetId: ASSET_ID, alt: 'Ảnh', decorative: false };

  /** Every <img> of a page, in document order, with how it loads. */
  function imagesOf(composition: Composition, ctx: RenderContext) {
    const markup = renderToStaticMarkup(
      <PageView composition={composition} themePresetId="mint" ctx={ctx} />,
    );
    return [...markup.matchAll(/<img [^>]*>/g)].map(([tag]) => ({
      loading: /loading="([^"]+)"/.exec(tag)?.[1] ?? null,
      // HTML attribute names are case-insensitive; React writes this one as `fetchPriority`.
      fetchpriority: /fetchpriority="([^"]+)"/i.exec(tag)?.[1] ?? null,
    }));
  }

  function withImages(...targets: SectionInstance[]): Composition {
    return { version: 1, sections: targets };
  }

  const EAGER = { loading: 'eager', fetchpriority: 'high' };
  const LAZY = { loading: 'lazy', fetchpriority: null };

  // The Hero photo is the largest paint of most pages: lazy loading waits for layout first.
  it.each(['split', 'background'])(
    'loads the photo of a %s Hero after the navigation bar at once, with high priority',
    (variant) => {
      const images = imagesOf(
        withImages(
          section('navbar'),
          withContent(section('hero', variant), 'image', PHOTO),
          withContent(section('benefits', 'alternate'), 'items.0.image', PHOTO),
          section('footer'),
        ),
        liveCtx(),
      );
      expect(images).toEqual([EAGER, LAZY]);
    },
  );

  it('prioritises only the first image of the first section, whatever its type', () => {
    let benefits = section('benefits', 'alternate');
    for (const index of [0, 1, 2]) {
      benefits = withContent(benefits, `items.${index}.image`, PHOTO);
    }
    const images = imagesOf(
      withImages(benefits, withContent(section('hero', 'split'), 'image', PHOTO)),
      liveCtx(),
    );
    expect(images).toEqual([EAGER, LAZY, LAZY, LAZY]);
  });

  it('loads the photo after at once when it opens the page and the photo before is missing', () => {
    const pair = withContent(section('before_after'), 'afterImage', PHOTO);
    expect(imagesOf(withImages(section('navbar'), pair), liveCtx())).toEqual([EAGER]);
    const both = withContent(pair, 'beforeImage', PHOTO);
    expect(imagesOf(withImages(section('navbar'), both), liveCtx())).toEqual([EAGER, LAZY]);
  });

  it('keeps every image lazy when the first section draws none', () => {
    const images = imagesOf(
      withImages(
        section('navbar'),
        section('hero', 'centered'),
        withContent(section('benefits', 'alternate'), 'items.0.image', PHOTO),
      ),
      liveCtx(),
    );
    expect(images).toEqual([LAZY]);
  });

  // The canvas draws the draft for editing: nothing there changes how it loads.
  it('leaves the images of the admin canvas lazy', () => {
    const images = imagesOf(
      withImages(section('navbar'), withContent(section('hero', 'split'), 'image', PHOTO)),
      editCtx(),
    );
    expect(images).toEqual([LAZY]);
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

  it('numbers the steps of a process in an ordered list, without icons or images', () => {
    const steps = section('benefits', 'steps');
    const markup = render(steps, liveCtx());
    // WebKit takes the list semantics from a list without bullets unless it has the role.
    expect(markup).toContain(`<ol class="${cls(benefitsStyles.steps)}" role="list">`);
    expect(count(markup, '<li')).toBe(3);
    expect(count(markup, '<h3')).toBe(3);
    expect(markup).toContain('<h2');
    // Each step says its number in words, and the drawn number is not read out a second time.
    for (const number of [1, 2, 3]) {
      expect(markup).toContain(
        `<span class="${cls(benefitsStyles.stepLabel)}">Bước ${number}:</span>` +
          `<span class="${cls(benefitsStyles.stepNumber)}" aria-hidden="true">${number}</span>`,
      );
    }
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('>Để lại thông tin</h3>');
    // On the canvas, an empty title asks for a step's title, not a benefit's.
    expect(count(render(steps, editCtx()), 'aria-label="Tiêu đề bước"')).toBe(3);
    expect(
      count(render(section('benefits', 'grid'), editCtx()), 'aria-label="Tiêu đề lợi ích"'),
    ).toBe(3);
    const five = withContent(steps, 'items', [
      ...(steps.content['items'] as unknown[]),
      ...(steps.content['items'] as unknown[]).slice(0, 2),
    ]);
    expect(count(render(five, liveCtx()), '<li')).toBe(5);
  });

  it('lists partner logos named by their description, and drops the ones without an image', () => {
    let logos = section('logos');
    logos = withContent(logos, 'items.0.image', {
      assetId: ASSET_ID,
      alt: 'Bệnh viện Hòa Bình',
      decorative: false,
    });
    logos = withContent(logos, 'items.2.image', {
      assetId: ASSET_ID,
      alt: 'Trường Đại học Y',
      decorative: false,
    });
    const live = render(logos, liveCtx());
    expect(live).toContain('<ul');
    expect(count(live, '<li')).toBe(2);
    expect(count(live, cls(logosStyles.image))).toBe(2);
    expect(live).toContain('alt="Bệnh viện Hòa Bình"');
    expect(live).toContain('alt="Trường Đại học Y"');
    expect(live).not.toContain('Chưa chọn logo');
    expect(live).toContain('>Đối tác đã tin dùng chúng tôi</h2>');

    // The canvas keeps a slot for every logo, the missing ones as placeholders.
    const edit = render(logos, editCtx());
    expect(count(edit, '<li')).toBe(4);
    expect(count(edit, 'Chưa chọn logo')).toBe(2);

    // Without any image and heading, a live page draws no empty list.
    const bare = render(withContent(section('logos'), 'heading', ''), liveCtx());
    expect(bare).not.toContain('<ul');
  });

  it('shows the photo before first and the one after second, each with its caption', () => {
    let pair = section('before_after');
    pair = withContent(pair, 'beforeImage', {
      assetId: ASSET_ID,
      alt: 'Răng trước khi niềng',
      decorative: false,
    });
    pair = withContent(pair, 'afterImage', {
      assetId: ASSET_ID,
      alt: 'Răng sau 12 tháng',
      decorative: false,
    });
    const markup = render(pair, liveCtx());
    expect(count(markup, '<figure')).toBe(2);
    expect(count(markup, '<figcaption')).toBe(2);
    expect(markup.indexOf('Răng trước khi niềng')).toBeLessThan(
      markup.indexOf('Răng sau 12 tháng'),
    );
    expect(markup.indexOf('Trước khi bắt đầu')).toBeLessThan(markup.indexOf('Sau khi hoàn thành'));
    expect(markup).toContain('Kết quả có thể khác nhau tùy từng người.');

    const edit = render(section('before_after'), editCtx());
    expect(edit).toContain('Chưa chọn ảnh trước');
    expect(edit).toContain('Chưa chọn ảnh sau');
  });

  it('calls and opens Zalo from the quick contact, leaving out an unused button', () => {
    let quick = section('quick_contact');
    quick = withContent(quick, 'call.link', { kind: 'phone', phone: '0901 234 567' });
    quick = withContent(quick, 'zalo.link', { kind: 'zalo', phone: '0901 234 567' });
    const markup = render(quick, liveCtx());
    expect(markup).toMatch(
      new RegExp(
        `<a class="[^"]*${cls(frame.buttonPrimary)}[^"]*" href="tel:0901234567">Gọi ngay</a>`,
      ),
    );
    expect(markup).toMatch(
      new RegExp(
        `<a class="[^"]*${cls(frame.buttonSecondary)}[^"]*" href="https://zalo.me/0901234567" target="_blank" rel="noopener noreferrer">Nhắn Zalo</a>`,
      ),
    );

    const callOnly = render(withContent(quick, 'zalo.label', ''), liveCtx());
    expect(callOnly).toContain('tel:0901234567');
    expect(callOnly).not.toContain('zalo.me');

    const none = withContent(withContent(quick, 'zalo.label', ''), 'call.label', '');
    expect(render(none, liveCtx())).not.toContain(cls(quickContactStyles.actions));
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

describe('privacy policy link of the footer', () => {
  const CAPTURE = {
    requiredText: 'Tôi đồng ý để Smile Care xử lý họ tên và số điện thoại của tôi.',
    marketingText: null,
    policyUrl: 'https://smilecare.vn/chinh-sach',
  };
  const POLICY_LINK =
    '<a class="' +
    cls(frame.textLink) +
    '" href="https://smilecare.vn/chinh-sach" target="_blank" rel="noopener noreferrer">Chính sách quyền riêng tư</a>';

  function footerWith(links: { label: string; link: Link }[]): SectionInstance {
    return withContent(
      section('footer'),
      'links',
      links.map((link) => ({ link })),
    );
  }

  it('follows the owner’s links on a page with a form', () => {
    const footer = footerWith([
      { label: 'Bảng giá', link: { kind: 'url', url: 'https://smilecare.vn/bang-gia' } },
    ]);
    const markup = render(footer, liveCtx({ leadCapture: CAPTURE }));
    expect(count(markup, '<li')).toBe(2);
    expect(markup).toContain(POLICY_LINK);
    expect(markup.indexOf('Bảng giá')).toBeLessThan(markup.indexOf(POLICY_LINK));
    // A footer without links of its own still gets the list, with the policy alone.
    const alone = render(section('footer'), liveCtx({ leadCapture: CAPTURE }));
    expect(count(alone, '<li')).toBe(1);
    expect(alone).toContain(POLICY_LINK);
  });

  it('is left out on a page without a form', () => {
    expect(render(section('footer'), liveCtx())).not.toContain('Chính sách quyền riêng tư');
    expect(render(section('footer'), liveCtx())).not.toContain('<ul');
  });

  it('is not repeated when the owner already links the same address', () => {
    for (const url of ['https://smilecare.vn/chinh-sach', 'https://SmileCare.vn/chinh-sach']) {
      const footer = footerWith([{ label: 'Quyền riêng tư', link: { kind: 'url', url } }]);
      const markup = render(footer, liveCtx({ leadCapture: CAPTURE }));
      expect(count(markup, '<li')).toBe(1);
      expect(markup).not.toContain('Chính sách quyền riêng tư');
      expect(markup).toContain('>Quyền riêng tư</a>');
    }
    const other = footerWith([
      {
        label: 'Điều khoản',
        link: { kind: 'url', url: 'https://smilecare.vn/chinh-sach/dieu-khoan' },
      },
    ]);
    expect(count(render(other, liveCtx({ leadCapture: CAPTURE })), '<li')).toBe(2);
  });

  it('shows on the canvas without leading anywhere', () => {
    const markup = render(section('footer'), editCtx({ leadCapture: CAPTURE }));
    expect(markup).toContain(
      `<span class="${cls(frame.textLink)}">Chính sách quyền riêng tư</span>`,
    );
    expect(markup).not.toContain('href=');
  });
});

describe('lead form', () => {
  const CAPTURE = {
    requiredText: 'Tôi đồng ý để Smile Care xử lý họ tên và số điện thoại của tôi.',
    marketingText: 'Nhận ưu đãi qua Zalo',
    policyUrl: 'https://smilecare.vn/chinh-sach',
  };
  const RELEASE_ID = 'c3'.repeat(12);
  const SUBMISSION_ID = '5e0b7c1d-2f3a-4b5c-8d9e-0f1a2b3c4d5e';

  it('posts a plain form to /_lead with the release the visitor sees', () => {
    const form = section('lead_form');
    const markup = render(
      form,
      liveCtx({
        leadCapture: CAPTURE,
        leadSubmission: {
          releaseId: RELEASE_ID,
          submissionId: SUBMISSION_ID,
          render: () => 'interactive form',
        },
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
        submissionId={SUBMISSION_ID}
      />,
    );
    expect(plain).toContain('<form');
    expect(plain).toContain('method="post"');
    expect(plain).toContain('action="/_lead"');
    expect(plain).toContain(`name="releaseId" value="${RELEASE_ID}"`);
    // Sent again after a timeout, the same form is a replay, not a second lead (ADR-016).
    expect(plain).toContain(
      `<input type="hidden" name="${LEAD_SUBMISSION_FIELD}" value="${SUBMISSION_ID}"/>`,
    );
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
          submissionId: SUBMISSION_ID,
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
        submissionId: SUBMISSION_ID,
      },
    ]);
  });

  it('marks a field error with an icon and ties it to the field', () => {
    const form = section('lead_form');
    const markup = renderToStaticMarkup(
      <LeadFormView
        sectionId={form.id}
        content={sampleLeadForm(form)}
        capture={CAPTURE}
        releaseId={RELEASE_ID}
        submissionId={SUBMISSION_ID}
        errors={{ phone: 'Số điện thoại chưa đúng.' }}
      />,
    );
    const error = new RegExp(
      `<span id="lead-${form.id}-phone-error"[^>]*><svg aria-hidden="true"[^>]*>.*?</svg>Số điện thoại chưa đúng.</span>`,
    );
    expect(markup).toMatch(error);
    expect(markup).toContain(`aria-describedby="lead-${form.id}-phone-error"`);
  });

  it('draws no submission id where the form cannot send', () => {
    const form = section('lead_form');
    const preview = render(form, liveCtx({ leadCapture: CAPTURE }));
    expect(preview).not.toContain(`name="${LEAD_SUBMISSION_FIELD}"`);
    expect(preview).not.toContain('name="releaseId"');
  });

  it('keeps the send button focusable while sending, so a refusal finds the visitor on it', () => {
    const form = section('lead_form');
    const sending = renderToStaticMarkup(
      <LeadFormView
        sectionId={form.id}
        content={sampleLeadForm(form)}
        capture={CAPTURE}
        releaseId={RELEASE_ID}
        submissionId={SUBMISSION_ID}
        submitting
      />,
    );
    expect(sending).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*aria-disabled="true")[^>]*>/);
    expect(sending).toContain('aria-busy="true"');
    expect(sending).not.toContain('disabled=""');
    // The label says the send is under way, instead of inviting another press.
    expect(sending).toMatch(/aria-busy="true"[^>]*>Đang gửi…<\/button>/);
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

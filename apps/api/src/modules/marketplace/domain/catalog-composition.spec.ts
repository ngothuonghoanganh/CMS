import type { Composition, SectionInstance } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { bundledMarketplaceCatalog } from '../../../../test/marketplace.js';
import { checkCatalogComposition } from './catalog-composition.js';

/** The spa item's v1: a page with a call and Zalo section and a band leading to it. */
function spa(): Composition {
  const item = bundledMarketplaceCatalog().items.find(({ id }) => id === 'mp-spa-uu-dai-ngay-le');
  const composition = item?.versions[0]?.composition;
  if (composition === undefined) {
    throw new Error('The bundled catalog has no spa item');
  }
  return composition;
}

function changed(
  composition: Composition,
  type: SectionInstance['type'],
  change: (section: SectionInstance) => SectionInstance,
): Composition {
  return {
    ...composition,
    sections: composition.sections.map((section) =>
      section.type === type ? change(section) : section,
    ),
  };
}

function problemsOf(composition: Composition): string[] {
  const check = checkCatalogComposition(composition);
  return check.valid ? [] : check.problems;
}

const IMAGE = { assetId: '64b000000000000000000001', alt: 'Phòng spa', decorative: false };

describe('a composition of the marketplace catalog (ADR-036)', () => {
  it('passes as the registry parses it, buttons leading to its own sections', () => {
    const check = checkCatalogComposition(spa());
    expect(check).toEqual({ valid: true, composition: spa() });
  });

  it('has at least one section', () => {
    expect(problemsOf({ version: 1, sections: [] })).toEqual([
      'sections: a template has at least one section',
    ]);
  });

  it('uses only the variants and content of the registry', () => {
    expect(problemsOf(changed(spa(), 'hero', (hero) => ({ ...hero, variant: 'video' })))).toEqual([
      'sections.1.variant: Kiểu bố cục "video" không có trong section Hero',
    ]);
    expect(
      problemsOf(
        changed(spa(), 'faq', (faq) => ({ ...faq, content: { ...faq.content, items: 'ba câu' } })),
      ),
    ).toHaveLength(1);
  });

  it('is exactly what the registry makes of it: no unknown key, no stray sample path', () => {
    expect(
      problemsOf(
        changed(spa(), 'hero', (hero) => ({
          ...hero,
          content: { ...hero.content, subtitle: 'Một khóa không ai đọc' },
        })),
      ),
    ).toEqual([
      'sections.1: differs from what the registry makes of it; write it as parsed (no key its schema does not know, sample paths of its texts only, no motion that changes nothing)',
    ]);
    expect(
      problemsOf(
        changed(spa(), 'hero', (hero) => ({
          ...hero,
          samplePaths: [...hero.samplePaths, 'items.9.title'],
        })),
      ),
    ).toHaveLength(1);
    expect(
      problemsOf({
        ...spa(),
        motion: { style: 'none', level: 'mid', accents: {}, reduceOnMobile: false },
      }),
    ).toEqual(['motion: differs from what the registry makes of it; leave out the default']);
  });

  it('has empty image frames, the hidden ones included', () => {
    expect(
      problemsOf(
        changed(spa(), 'hero', (hero) => ({ ...hero, content: { ...hero.content, image: IMAGE } })),
      ),
    ).toEqual([
      'sections.1.content.image: holds an image; a marketplace template has empty image frames',
    ]);
    // The centered Hero hides its image; a switch to another variant would show it again.
    expect(spa().sections[1]?.variant).toBe('centered');
    expect(
      problemsOf(
        changed(spa(), 'testimonials', (section) => ({
          ...section,
          content: {
            ...section.content,
            items: (section.content['items'] as Record<string, unknown>[]).map((item, index) =>
              index === 0 ? { ...item, avatar: IMAGE } : item,
            ),
          },
        })),
      ),
    ).toEqual([
      'sections.3.content.items.0.avatar: holds an image; a marketplace template has empty image frames',
    ]);
  });

  it('never links to a page, nor to a section that is not on it', () => {
    expect(
      problemsOf(
        changed(spa(), 'navbar', (navbar) => ({
          ...navbar,
          content: {
            ...navbar.content,
            cta: { label: 'Đặt lịch', link: { kind: 'page', pageId: '64b000000000000000000002' } },
          },
        })),
      ),
    ).toEqual(['sections.0.content.cta: links to a page; pages belong to one site']);
    expect(
      problemsOf(
        changed(spa(), 'cta_band', (band) => ({
          ...band,
          content: {
            ...band.content,
            cta: { label: 'Giữ giờ ngay', link: { kind: 'section', sectionId: 'khongco01' } },
          },
        })),
      ),
    ).toEqual(['sections.5.content.cta: links to section "khongco01", not on this page']);
  });

  it('keeps every text as sample text, with nothing left to review', () => {
    expect(
      problemsOf(
        changed(spa(), 'faq', (faq) => ({
          ...faq,
          samplePaths: faq.samplePaths.filter((path) => path !== 'heading'),
        })),
      ),
    ).toEqual(['sections.4.samplePaths: "heading" is not marked as sample text']);
    expect(
      problemsOf(changed(spa(), 'faq', (faq) => ({ ...faq, reviewPaths: ['heading'] }))),
    ).toEqual(['sections.4.reviewPaths: a template has no text to review']);
  });
});

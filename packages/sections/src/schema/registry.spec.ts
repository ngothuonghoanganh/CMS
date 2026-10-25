import { type Composition, type SectionType, sectionTypes } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  bodyInsertionIndex,
  canMoveSection,
  collectLeaves,
  createSectionInstance,
  getSectionDefinition,
  insertionIndex,
  listMinimum,
  leadFormSectionOf,
  pageCapturesLeads,
  samplePathsOf,
  validateComposition,
} from './registry.js';

function id(index: number): string {
  return `section${String(index).padStart(4, '0')}`;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at index ${index}`);
  }
  return item;
}

function page(types: readonly SectionType[]): Composition {
  return {
    version: 1,
    sections: types.map((type, index) => createSectionInstance(type, undefined, id(index))),
  };
}

describe('section registry', () => {
  it.each(sectionTypes)('creates a valid "%s" section from its sample content', (type) => {
    const definition = getSectionDefinition(type);
    for (const variant of definition.variants) {
      const section = createSectionInstance(type, variant.id, id(1));
      expect(validateComposition({ version: 1, sections: [section] })).toEqual([]);
      expect(section.samplePaths).toEqual(samplePathsOf(section));
    }
  });

  it('validates a full page in the fixed order', () => {
    expect(
      validateComposition(
        page(['navbar', 'hero', 'benefits', 'testimonials', 'faq', 'cta_band', 'footer']),
      ),
    ).toEqual([]);
  });

  it('rejects a navigation bar that is not first and a footer that is not last', () => {
    const issues = validateComposition(page(['hero', 'navbar', 'footer', 'faq']));
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['invalid_position', ['sections', 1, 'type']],
      ['invalid_position', ['sections', 2, 'type']],
    ]);
  });

  it('rejects a second singleton and an unknown variant', () => {
    const composition = page(['hero', 'footer']);
    const extraFooter = createSectionInstance('footer', undefined, id(9));
    const broken: Composition = {
      version: 1,
      sections: [
        { ...at(composition.sections, 0), variant: 'nope' },
        extraFooter,
        at(composition.sections, 1),
      ],
    };
    const codes = validateComposition(broken).map((issue) => issue.code);
    expect(codes).toContain('invalid_variant');
    expect(codes).toContain('duplicate_singleton');
  });

  it('reports content errors with paths relative to the composition', () => {
    const composition = page(['hero']);
    const hero = at(composition.sections, 0);
    const issues = validateComposition({
      version: 1,
      sections: [{ ...hero, content: { ...hero.content, heading: 'x'.repeat(81) } }],
    });
    expect(issues).toEqual([
      expect.objectContaining({ path: ['sections', 0, 'content', 'heading'] }),
    ]);
  });

  it('enforces list limits from the schema', () => {
    const composition = page(['faq']);
    const faq = at(composition.sections, 0);
    const issues = validateComposition({
      version: 1,
      sections: [{ ...faq, content: { ...faq.content, items: [] } }],
    });
    expect(issues[0]?.path).toEqual(['sections', 0, 'content', 'items']);
  });

  it('skips fields hidden by the variant', () => {
    const grid = createSectionInstance('benefits', 'grid', id(1));
    const alternate = createSectionInstance('benefits', 'alternate', id(2));
    expect(collectLeaves(grid).some((leaf) => leaf.path.endsWith('.image'))).toBe(false);
    expect(collectLeaves(alternate).some((leaf) => leaf.path.endsWith('.image'))).toBe(true);
    expect(collectLeaves(alternate).some((leaf) => leaf.path.endsWith('.icon'))).toBe(false);
  });

  it('returns hidden fields too when asked, since switching variants keeps their values', () => {
    const centered = createSectionInstance('hero', 'centered', id(1));
    const hero = {
      ...centered,
      content: {
        ...centered.content,
        image: { assetId: 'a'.repeat(24), alt: 'Ảnh', decorative: false },
      },
    };
    expect(collectLeaves(hero).some((leaf) => leaf.path === 'image')).toBe(false);
    expect(collectLeaves(hero, { includeHidden: true })).toContainEqual(
      expect.objectContaining({ path: 'image', value: hero.content.image }),
    );
  });

  it('marks sample text in fields the variant hides, so a variant switch still warns', () => {
    const quote = createSectionInstance('testimonials', 'quote', id(1));
    expect(quote.content.heading).toBe('Khách hàng nói gì về chúng tôi');
    expect(quote.samplePaths).toContain('heading');
    expect(samplePathsOf(quote)).toContain('heading');
  });

  it('needs 3 items in the benefits grid and the testimonial cards, fewer in the other variants', () => {
    expect(listMinimum('benefits', 'grid', 'items')).toBe(3);
    expect(listMinimum('benefits', 'alternate', 'items')).toBe(2);
    expect(listMinimum('testimonials', 'cards', 'items')).toBe(3);
    expect(listMinimum('testimonials', 'quote', 'items')).toBe(1);
    expect(listMinimum('faq', 'accordion', 'items')).toBe(1);

    function withItems(type: 'benefits' | 'testimonials', variant: string, count: number) {
      const section = createSectionInstance(type, variant, id(1));
      const items = section.content.items;
      if (!Array.isArray(items)) {
        throw new Error('The sample has no items');
      }
      return { ...section, content: { ...section.content, items: items.slice(0, count) } };
    }
    expect(
      validateComposition({ version: 1, sections: [withItems('benefits', 'grid', 2)] }),
    ).toEqual([
      {
        path: ['sections', 0, 'content', 'items'],
        code: 'too_small',
        message: 'Bố cục “Lưới 3–6 lợi ích” cần ít nhất 3 lợi ích',
      },
    ]);
    expect(
      validateComposition({ version: 1, sections: [withItems('benefits', 'alternate', 2)] }),
    ).toEqual([]);
    expect(
      validateComposition({ version: 1, sections: [withItems('testimonials', 'cards', 1)] }),
    ).toEqual([
      {
        path: ['sections', 0, 'content', 'items'],
        code: 'too_small',
        message: 'Bố cục “Nhận xét dạng thẻ” cần ít nhất 3 nhận xét',
      },
    ]);
    expect(
      validateComposition({ version: 1, sections: [withItems('testimonials', 'quote', 1)] }),
    ).toEqual([]);
  });

  it('places fixed sections at their position and keeps others between them', () => {
    const sections = page(['navbar', 'hero', 'faq', 'footer']).sections;
    expect(insertionIndex(sections, 'footer', 1)).toBe(4);
    expect(insertionIndex(sections, 'navbar', 3)).toBe(0);
    expect(insertionIndex(sections, 'benefits', 0)).toBe(1);
    expect(insertionIndex(sections, 'benefits', 4)).toBe(3);
    expect(canMoveSection(sections, 0, 1)).toBe(false);
    expect(canMoveSection(sections, 1, 2)).toBe(true);
    expect(canMoveSection(sections, 2, 3)).toBe(false);
    expect(canMoveSection(sections, 2, 0)).toBe(false);
    // Past the end, a body section still lands before the footer.
    expect(bodyInsertionIndex(sections, 4)).toBe(3);
    expect(bodyInsertionIndex(sections, 0)).toBe(1);
  });

  it('finds the lead form, the only section that collects personal data', () => {
    const withForm = page(['navbar', 'hero', 'lead_form', 'footer']);
    expect(pageCapturesLeads(withForm)).toBe(true);
    expect(leadFormSectionOf(withForm)?.type).toBe('lead_form');
    const others = page(sectionTypes.filter((type) => type !== 'lead_form'));
    expect(pageCapturesLeads(others)).toBe(false);
    expect(leadFormSectionOf(others)).toBeNull();
    expect(pageCapturesLeads({ version: 1, sections: [] })).toBe(false);
  });
});

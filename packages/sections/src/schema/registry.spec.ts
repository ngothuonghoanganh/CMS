import {
  type Composition,
  pageGoalIds,
  pageStyleIds,
  type SectionInstance,
  type SectionType,
  sectionTypes,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { buildCompositionFromGoal } from './blueprints.js';
import { getAtPath } from './paths.js';
import {
  bodyInsertionIndex,
  canMoveSection,
  collectLeaves,
  createSectionInstance,
  getSectionDefinition,
  insertionIndex,
  listMaximum,
  listMinimum,
  leadFormSectionOf,
  pageCapturesLeads,
  parseComposition,
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

  it.each(sectionTypes)('keeps the rules of "%s" consistent with its fields', (type) => {
    const definition = getSectionDefinition(type);
    for (const key of definition.oneButtonRequired ?? []) {
      expect(definition.fields.find((field) => field.key === key)?.kind, key).toBe('cta');
    }
    for (const variant of definition.variants) {
      const section = createSectionInstance(type, variant.id, id(1));
      for (const field of definition.fields) {
        if (field.kind !== 'list') {
          continue;
        }
        const minimum = listMinimum(type, variant.id, field.key);
        const maximum = listMaximum(type, variant.id, field.key);
        expect(minimum, `${variant.id} · ${field.key}`).toBeLessThanOrEqual(maximum);
        expect(maximum).toBeLessThanOrEqual(field.max);
      }
      // A button limited to some kinds of link starts with one of them.
      for (const leaf of collectLeaves(section, { includeHidden: true })) {
        if (leaf.field.kind === 'cta' && leaf.field.linkKinds !== undefined) {
          expect(leaf.field.linkKinds).toContain(getAtPath(leaf.value, 'link.kind'));
        }
      }
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

  it('keeps a process to 3–5 steps, within the 2–6 benefits of the field', () => {
    expect(listMinimum('benefits', 'steps', 'items')).toBe(3);
    expect(listMaximum('benefits', 'steps', 'items')).toBe(5);
    expect(listMaximum('benefits', 'grid', 'items')).toBe(6);
    expect(listMaximum('logos', 'row', 'items')).toBe(12);
    expect(listMaximum('hero', 'split', 'heading')).toBe(Infinity);

    function steps(count: number): SectionInstance {
      const section = createSectionInstance('benefits', 'steps', id(1));
      const items = section.content.items;
      if (!Array.isArray(items)) {
        throw new Error('The sample has no items');
      }
      return {
        ...section,
        content: {
          ...section.content,
          items: Array.from({ length: count }, (_unused, index): unknown => items[index % 3]),
        },
      };
    }
    expect(validateComposition({ version: 1, sections: [steps(5)] })).toEqual([]);
    expect(validateComposition({ version: 1, sections: [steps(6)] })).toEqual([
      {
        path: ['sections', 0, 'content', 'items'],
        code: 'too_big',
        message: 'Bố cục “Quy trình 3 bước” có tối đa 5 lợi ích',
      },
    ]);
    expect(validateComposition({ version: 1, sections: [steps(2)] })).toEqual([
      {
        path: ['sections', 0, 'content', 'items'],
        code: 'too_small',
        message: 'Bố cục “Quy trình 3 bước” cần ít nhất 3 lợi ích',
      },
    ]);
    // Over the field's own maximum, the schema alone reports it.
    expect(
      validateComposition({ version: 1, sections: [steps(7)] }).map((issue) => issue.code),
    ).toEqual(['too_big']);
  });

  it('starts a process with steps of its own, not with benefits', () => {
    const steps = createSectionInstance('benefits', 'steps', id(1));
    expect(getAtPath(steps.content, 'heading')).toBe('Bắt đầu chỉ với 3 bước');
    expect(getAtPath(steps.content, 'items.0.title')).toBe('Để lại thông tin');
    const list = getSectionDefinition('benefits').fields.find((field) => field.key === 'items');
    if (list?.kind !== 'list') {
      throw new Error('Benefits have no item list');
    }
    expect(list.newItem('steps')).toMatchObject({ title: 'Bước tiếp theo' });
    expect(list.newItem('grid')).toMatchObject({ title: 'Lợi ích mới' });
    // The steps show neither the icon nor the image of an item.
    expect(collectLeaves(steps).map((leaf) => leaf.path)).not.toContainEqual(
      expect.stringMatching(/\.(icon|image)$/),
    );
  });

  it('needs 3 to 12 partner logos, each an image described by the partner name', () => {
    const logos = createSectionInstance('logos', 'row', id(1));
    expect(logos.samplePaths).toEqual(['heading']);
    const items = getAtPath(logos.content, 'items');
    expect(items).toHaveLength(4);
    const image = { assetId: 'a'.repeat(24), alt: 'Bệnh viện Hòa Bình', decorative: false };
    const withLogos = (count: number) => ({
      ...logos,
      content: { ...logos.content, items: Array.from({ length: count }, () => ({ image })) },
    });
    expect(validateComposition({ version: 1, sections: [withLogos(3)] })).toEqual([]);
    expect(validateComposition({ version: 1, sections: [withLogos(12)] })).toEqual([]);
    for (const count of [2, 13]) {
      expect(validateComposition({ version: 1, sections: [withLogos(count)] })).toEqual([
        expect.objectContaining({ path: ['sections', 0, 'content', 'items'] }),
      ]);
    }
    expect(
      collectLeaves(logos)
        .filter((leaf) => leaf.field.kind === 'image')
        .map((leaf) => [leaf.path, leaf.field.required]),
    ).toEqual([
      ['items.0.image', true],
      ['items.1.image', true],
      ['items.2.image', true],
      ['items.3.image', true],
    ]);
  });

  it('requires both photos of a before and after, each with its caption', () => {
    const pair = createSectionInstance('before_after', 'side_by_side', id(1));
    expect(
      collectLeaves(pair)
        .filter((leaf) => leaf.field.required)
        .map((leaf) => leaf.path),
    ).toEqual(['heading', 'beforeImage', 'beforeCaption', 'afterImage', 'afterCaption']);
    expect(pair.samplePaths).toEqual(['heading', 'beforeCaption', 'afterCaption', 'note']);
  });

  it('lets the call button only call and the Zalo button only open Zalo', () => {
    const quick = createSectionInstance('quick_contact', 'buttons', id(1));
    expect(getSectionDefinition('quick_contact').oneButtonRequired).toEqual(['call', 'zalo']);
    const withLink = (path: 'call' | 'zalo', link: unknown) => ({
      ...quick,
      content: { ...quick.content, [path]: { label: 'Liên hệ', link } },
    });
    expect(
      validateComposition({
        version: 1,
        sections: [withLink('call', { kind: 'phone', phone: '0901 234 567' })],
      }),
    ).toEqual([]);
    expect(
      validateComposition({
        version: 1,
        sections: [withLink('zalo', { kind: 'zalo', phone: '0901234567' })],
      }),
    ).toEqual([]);
    for (const [path, link] of [
      ['call', { kind: 'url', url: 'https://example.com' }],
      ['call', { kind: 'zalo', phone: '0901234567' }],
      ['zalo', { kind: 'phone', phone: '0901234567' }],
      ['zalo', { kind: 'none' }],
    ] as const) {
      expect(
        validateComposition({ version: 1, sections: [withLink(path, link)] })[0]?.path.slice(0, 5),
      ).toEqual(['sections', 0, 'content', path, 'link']);
    }
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

  it('names the place a fixed section belongs to', () => {
    expect(validateComposition(page(['hero', 'navbar', 'footer', 'faq']))).toEqual([
      expect.objectContaining({ message: 'Thanh điều hướng phải là section đầu tiên của trang' }),
      expect.objectContaining({ message: 'Chân trang phải là section cuối cùng của trang' }),
    ]);
  });

  it('points a second singleton at its type', () => {
    expect(validateComposition(page(['navbar', 'hero', 'lead_form', 'lead_form']))).toEqual([
      {
        path: ['sections', 3, 'type'],
        code: 'duplicate_singleton',
        message: 'Một trang chỉ có một section Form đăng ký',
      },
    ]);
  });

  it('reports a missing list once, from the schema, without counting its items', () => {
    const grid = createSectionInstance('benefits', 'grid', id(1));
    const { items: _items, ...withoutItems } = grid.content;
    expect(
      validateComposition({ version: 1, sections: [{ ...grid, content: withoutItems }] }),
    ).toEqual([expect.objectContaining({ path: ['sections', 0, 'content', 'items'] })]);
  });

  it('has no minimum for a key that is not a list', () => {
    expect(listMinimum('hero', 'split', 'heading')).toBe(0);
    expect(listMinimum('benefits', 'grid', 'nope')).toBe(0);
  });

  it('reads the fields after a list that is not an array', () => {
    const footer = createSectionInstance('footer', undefined, id(1));
    const paths = collectLeaves({ ...footer, content: { ...footer.content, links: null } }).map(
      (leaf) => leaf.path,
    );
    expect(paths).toContain('copyright');
    expect(paths.some((path) => path.startsWith('links'))).toBe(false);
  });

  it('never moves a fixed section or a section onto itself', () => {
    const sections = page(['navbar', 'hero', 'faq', 'footer']).sections;
    expect(canMoveSection(sections, 1, 1)).toBe(false);
    expect(canMoveSection(sections, 2, 2)).toBe(false);
    expect(canMoveSection(sections, 1, -1)).toBe(false);
    expect(canMoveSection(sections, 2, 4)).toBe(false);
    expect(canMoveSection(sections, 4, 1)).toBe(false);
    // Even on a page where it is out of place, a fixed section is not dragged around.
    const misplaced = page(['hero', 'navbar']).sections;
    expect(canMoveSection(misplaced, 1, 0)).toBe(false);
    expect(canMoveSection(page(['hero', 'footer', 'faq']).sections, 1, 2)).toBe(false);
  });
});

describe('parseComposition', () => {
  it('returns the composition as validated, frame and all', () => {
    const hero = createSectionInstance('hero', 'split', id(1));
    const section = {
      ...hero,
      colorScheme: 'dark' as const,
      spacing: 'spacious' as const,
      visibility: { desktop: false, mobile: true },
      mobileOrder: 'media-first' as const,
    };
    expect(parseComposition({ version: 1, sections: [section] })).toEqual({
      success: true,
      composition: { version: 1, sections: [section] },
      issues: [],
    });
  });

  it('drops keys no schema knows, in content, buttons, links and list items', () => {
    const hero = createSectionInstance('hero', 'split', id(1));
    const benefits = createSectionInstance('benefits', 'grid', id(2));
    const items = benefits.content['items'];
    if (!Array.isArray(items)) {
      throw new Error('The sample has no items');
    }
    const parsed = parseComposition({
      version: 1,
      sections: [
        {
          ...hero,
          content: {
            ...hero.content,
            onload: 'x',
            primaryCta: {
              label: 'Gọi',
              style: 'x',
              link: { kind: 'phone', phone: '0901', url: 'x' },
            },
          },
        },
        {
          ...benefits,
          content: {
            ...benefits.content,
            items: items.map((item: unknown) => ({ ...(item as object), html: 'x' })),
          },
        },
      ],
    });
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.issues));
    }
    const [parsedHero, parsedBenefits] = parsed.composition.sections;
    expect(parsedHero?.content).toEqual({
      ...hero.content,
      primaryCta: { label: 'Gọi', link: { kind: 'phone', phone: '0901' } },
    });
    expect(parsedBenefits?.content).toEqual(benefits.content);
  });

  it('keeps sample paths of text fields and button labels once, hidden ones included', () => {
    const quote = createSectionInstance('testimonials', 'quote', id(1));
    const centered = createSectionInstance('hero', 'centered', id(2));
    const parsed = parseComposition({
      version: 1,
      sections: [
        { ...quote, samplePaths: ['heading', 'items.0.quote', 'items.0.quote', 'items.9.quote'] },
        {
          ...centered,
          content: {
            ...centered.content,
            secondaryCta: { label: 'Xem thêm', link: { kind: 'none' } },
          },
          samplePaths: [
            'heading',
            'primaryCta.label',
            'secondaryCta.label',
            'primaryCta',
            'image',
            'image.alt',
            'nope',
          ],
        },
      ],
    });
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.issues));
    }
    expect(parsed.composition.sections.map((section) => section.samplePaths)).toEqual([
      ['heading', 'items.0.quote'],
      ['heading', 'primaryCta.label', 'secondaryCta.label'],
    ]);
  });

  it('fails with every issue and returns no composition', () => {
    const hero = createSectionInstance('hero', 'split', id(1));
    const result = parseComposition({
      version: 1,
      sections: [
        { ...hero, content: { ...hero.content, heading: 'x'.repeat(81) } },
        createSectionInstance('navbar', undefined, id(2)),
      ],
    });
    expect(result).toEqual({
      success: false,
      issues: [
        expect.objectContaining({ path: ['sections', 0, 'content', 'heading'] }),
        expect.objectContaining({ path: ['sections', 1, 'type'], code: 'invalid_position' }),
      ],
    });
  });
});

describe('validateComposition', () => {
  /** The sample's items, cut or repeated to `count`. */
  function withItems(type: 'benefits' | 'testimonials' | 'logos', variant: string, count: number) {
    const section = createSectionInstance(type, variant, id(1));
    const items = section.content.items;
    if (!Array.isArray(items)) {
      throw new Error('The sample has no items');
    }
    return {
      ...section,
      content: {
        ...section.content,
        items: Array.from(
          { length: count },
          (_unused, index): unknown => items[index % items.length],
        ),
      },
    };
  }

  function blueprint(goal: (typeof pageGoalIds)[number], style: (typeof pageStyleIds)[number]) {
    let next = 0;
    return buildCompositionFromGoal({
      goal,
      style,
      brief: { offer: 'Niềng răng trong suốt', audience: 'người đi làm', phone: '0901 234 567' },
      siteName: 'Smile Care',
      newId: () => id((next += 1)),
    });
  }

  const hero = createSectionInstance('hero', 'split', id(1));
  const faq = createSectionInstance('faq', undefined, id(1));
  const grid = createSectionInstance('benefits', 'grid', id(1));
  const quick = createSectionInstance('quick_contact', undefined, id(1));
  const { items: _items, ...gridWithoutItems } = grid.content;
  const fixtures: [string, Composition][] = [
    ...sectionTypes.flatMap((type) =>
      getSectionDefinition(type).variants.map((variant): [string, Composition] => [
        `sample ${type} · ${variant.id}`,
        { version: 1, sections: [createSectionInstance(type, variant.id, id(1))] },
      ]),
    ),
    [
      'full page',
      page(['navbar', 'hero', 'benefits', 'testimonials', 'faq', 'cta_band', 'footer']),
    ],
    ...pageGoalIds.flatMap((goal) =>
      pageStyleIds.map((style): [string, Composition] => [
        `blueprint ${goal} · ${style}`,
        blueprint(goal, style),
      ]),
    ),
    [
      'unknown keys and repeated sample paths',
      {
        version: 1,
        sections: [
          {
            ...hero,
            content: { ...hero.content, onload: 'x' },
            samplePaths: ['heading', 'heading', 'nope'],
          },
        ],
      },
    ],
    ['misplaced fixed sections', page(['hero', 'navbar', 'footer', 'faq'])],
    ['second singleton', page(['navbar', 'hero', 'lead_form', 'lead_form'])],
    [
      'unknown variant and second footer',
      {
        version: 1,
        sections: [
          { ...hero, variant: 'nope' },
          createSectionInstance('footer', undefined, id(2)),
          createSectionInstance('footer', undefined, id(3)),
        ],
      },
    ],
    [
      'content too long',
      {
        version: 1,
        sections: [{ ...hero, content: { ...hero.content, heading: 'x'.repeat(81) } }],
      },
    ],
    ['empty list', { version: 1, sections: [{ ...faq, content: { ...faq.content, items: [] } }] }],
    ['benefits grid of 2', { version: 1, sections: [withItems('benefits', 'grid', 2)] }],
    ['testimonial cards of 1', { version: 1, sections: [withItems('testimonials', 'cards', 1)] }],
    ['missing list', { version: 1, sections: [{ ...grid, content: gridWithoutItems }] }],
    ['steps of 6', { version: 1, sections: [withItems('benefits', 'steps', 6)] }],
    ['logos of 2', { version: 1, sections: [withItems('logos', 'row', 2)] }],
    [
      'call button to a web page',
      {
        version: 1,
        sections: [
          {
            ...quick,
            content: {
              ...quick.content,
              call: { label: 'Gọi', link: { kind: 'url', url: 'https://example.com' } },
            },
          },
        ],
      },
    ],
    [
      'issues in several sections',
      {
        version: 1,
        sections: [
          { ...hero, content: { ...hero.content, heading: 'x'.repeat(81) } },
          createSectionInstance('navbar', undefined, id(2)),
          { ...withItems('testimonials', 'cards', 1), variant: 'nope' },
        ],
      },
    ],
  ];

  it.each(fixtures)('reports the issues of parseComposition: %s', (_name, composition) => {
    expect(validateComposition(composition)).toEqual(parseComposition(composition).issues);
  });

  it('covers valid and invalid compositions alike', () => {
    const invalid = fixtures.filter(([, composition]) => validateComposition(composition).length);
    expect(invalid.length).toBeGreaterThanOrEqual(12);
    expect(invalid.length).toBeLessThan(fixtures.length);
  });

  it('builds no parsed section, so it never reads what only the result needs', () => {
    // The editor runs it on every keystroke: sample paths and the frame are for the result only.
    const read: string[] = [];
    const watched = (section: SectionInstance): SectionInstance =>
      Object.defineProperties(
        { ...section },
        {
          samplePaths: {
            get: () => {
              read.push('samplePaths');
              return section.samplePaths;
            },
          },
          visibility: {
            get: () => {
              read.push('visibility');
              return section.visibility;
            },
          },
        },
      );
    const composition: Composition = {
      version: 1,
      sections: [watched(hero), watched(createSectionInstance('faq', undefined, id(2)))],
    };

    expect(validateComposition(composition)).toEqual([]);
    expect(read).toEqual([]);
    expect(parseComposition(composition).success).toBe(true);
    expect(read).toContain('samplePaths');
  });
});

import type { Composition } from '@plp/contracts';
import { getAtPath, parseComposition, samplePathsOf } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { composition, heroSection, sampleSection } from '../../../../test/compositions.js';
import { imageAssetIds, templateContentOf, withAssetIds } from './template-content.js';

const PHOTO = '64b0000000000000000000a1';
const OTHER_PHOTO = '64b0000000000000000000a2';
const OTHER_PAGE = '64b0000000000000000000b1';

/** A real page: a Hero with a photo and a button to another page, benefits with a photo. */
function realPage(): Composition {
  const hero = heroSection({
    heading: 'Niềng răng trong suốt cho người bận rộn',
    ctaLink: { kind: 'page', pageId: OTHER_PAGE },
    secondaryLabel: 'Gọi ngay',
    secondaryLink: { kind: 'phone', phone: '0901234567' },
    image: { assetId: PHOTO, alt: 'Bác sĩ đang tư vấn', decorative: false },
  });
  const benefits = sampleSection('benefits', 'alternate');
  const items = getAtPath(benefits.content, 'items') as Record<string, unknown>[];
  const withPhoto = {
    ...benefits,
    content: {
      ...benefits.content,
      items: items.map((item, index) =>
        index === 0
          ? { ...item, image: { assetId: OTHER_PHOTO, alt: 'Phòng khám', decorative: false } }
          : item,
      ),
    },
    samplePaths: [],
  };
  return composition([hero, withPhoto]);
}

describe('templateContentOf', () => {
  it('keeps texts, marks and images with "Giữ chữ và ảnh như hiện tại"', () => {
    const page = realPage();
    const kept = templateContentOf(page, 'keep');
    expect(kept.sections.map((section) => section.samplePaths)).toEqual([[], []]);
    expect(getAtPath(kept.sections[0]?.content, 'image')).toEqual({
      assetId: PHOTO,
      alt: 'Bác sĩ đang tư vấn',
      decorative: false,
    });
    expect(getAtPath(kept.sections[0]?.content, 'heading')).toBe(
      'Niềng răng trong suốt cho người bận rộn',
    );
    expect(imageAssetIds(kept)).toEqual([PHOTO, OTHER_PHOTO]);
  });

  it('never keeps a button leading to a page of the source site', () => {
    for (const mode of ['keep', 'sample'] as const) {
      const hero = templateContentOf(realPage(), mode).sections[0];
      expect(getAtPath(hero?.content, 'primaryCta')).toEqual({
        label: 'Đặt lịch tư vấn',
        link: { kind: 'none' },
      });
      // Links that are not to a page stay.
      expect(getAtPath(hero?.content, 'secondaryCta.link')).toEqual({
        kind: 'phone',
        phone: '0901234567',
      });
    }
  });

  it('marks every text and button label as sample and empties the frames for "chữ mẫu"', () => {
    const sample = templateContentOf(realPage(), 'sample');
    for (const section of sample.sections) {
      expect(section.samplePaths).toEqual(samplePathsOf(section));
      expect(section.samplePaths.length).toBeGreaterThan(0);
    }
    expect(sample.sections[0]?.samplePaths).toEqual(
      expect.arrayContaining(['heading', 'subheading', 'primaryCta.label']),
    );
    expect(imageAssetIds(sample)).toEqual([]);
    expect(getAtPath(sample.sections[0]?.content, 'image')).toEqual({
      assetId: null,
      alt: '',
      decorative: false,
    });
    // Texts stay: they are marked, not removed.
    expect(getAtPath(sample.sections[0]?.content, 'heading')).toBe(
      'Niềng răng trong suốt cho người bận rộn',
    );
    expect(parseComposition(sample).success).toBe(true);
  });

  it('keeps the sentences the AI wrote to check only with the text itself (ADR-031)', () => {
    const page = realPage();
    const [hero, benefits] = page.sections;
    if (hero === undefined || benefits === undefined) {
      throw new Error('The page has a Hero and benefits');
    }
    const reviewed = composition([{ ...hero, reviewPaths: ['heading'] }, benefits]);
    expect(templateContentOf(reviewed, 'keep').sections[0]?.reviewPaths).toEqual(['heading']);
    expect(templateContentOf(reviewed, 'sample').sections[0]?.reviewPaths).toEqual([]);
  });

  it('never changes the page it reads', () => {
    const page = realPage();
    const before = structuredClone(page);
    templateContentOf(page, 'sample');
    templateContentOf(page, 'keep');
    expect(page).toEqual(before);
  });
});

describe('withAssetIds', () => {
  it('names each image by its new asset, keeping each use’s description', () => {
    const mapped = withAssetIds(
      realPage(),
      new Map([
        [PHOTO, '64b0000000000000000000c1'],
        [OTHER_PHOTO, '64b0000000000000000000c2'],
      ]),
    );
    expect(imageAssetIds(mapped)).toEqual(['64b0000000000000000000c1', '64b0000000000000000000c2']);
    expect(getAtPath(mapped.sections[0]?.content, 'image.alt')).toBe('Bác sĩ đang tư vấn');
  });

  it('empties the frame of an image it has no new asset for', () => {
    const mapped = withAssetIds(realPage(), new Map([[PHOTO, '64b0000000000000000000c1']]));
    expect(imageAssetIds(mapped)).toEqual(['64b0000000000000000000c1']);
    expect(getAtPath(mapped.sections[1]?.content, 'items.0.image')).toEqual({
      assetId: null,
      alt: '',
      decorative: false,
    });
  });
});

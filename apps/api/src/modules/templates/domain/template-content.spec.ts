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

/** A page whose buttons call, chat on Zalo, open a web page and go to its quick contact. */
function contactPage(): Composition {
  const contact = sampleSection('quick_contact');
  const withNumbers = {
    ...contact,
    content: {
      ...contact.content,
      call: { label: 'Gọi ngay', link: { kind: 'phone', phone: '0901234567' } },
      zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '0901234567' } },
    },
  };
  const hero = heroSection({
    heading: 'Niềng răng trong suốt cho người bận rộn',
    ctaLink: { kind: 'section', sectionId: contact.id },
    secondaryLabel: 'Gọi ngay',
    secondaryLink: { kind: 'phone', phone: '0901234567' },
  });
  const band = sampleSection('cta_band');
  const withSite = {
    ...band,
    content: {
      ...band.content,
      cta: { label: 'Xem bảng giá', link: { kind: 'url', url: 'https://smilecare.vn/bang-gia' } },
    },
  };
  return composition([hero, withNumbers, withSite]);
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
    }
  });

  it('keeps the phone, Zalo and web targets with the texts, and drops them with "chữ mẫu"', () => {
    const page = contactPage();
    const kept = templateContentOf(page, 'keep');
    expect(kept.sections.map((section) => section.content)).toEqual(
      page.sections.map((section) => section.content),
    );

    const [hero, contact, band] = templateContentOf(page, 'sample').sections;
    // No target: the page made from it shows where to choose one, as for a page link.
    expect(getAtPath(hero?.content, 'secondaryCta')).toEqual({
      label: 'Gọi ngay',
      link: { kind: 'none' },
    });
    expect(getAtPath(band?.content, 'cta.link')).toEqual({ kind: 'none' });
    // The quick contact's buttons only call and chat: they keep their kind, with no number.
    expect(getAtPath(contact?.content, 'call.link')).toEqual({ kind: 'phone', phone: '' });
    expect(getAtPath(contact?.content, 'zalo.link')).toEqual({ kind: 'zalo', phone: '' });
    // A button to a section of the page stays: the section comes with the template.
    expect(getAtPath(hero?.content, 'primaryCta.link')).toEqual({
      kind: 'section',
      sectionId: contact?.id,
    });
    expect(parseComposition(templateContentOf(page, 'sample')).success).toBe(true);
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

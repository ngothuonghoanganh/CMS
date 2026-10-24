import { describe, expect, it } from 'vitest';
import {
  cleanSeo,
  composition,
  heroSection,
  sampleSection,
} from '../../../../test/compositions.js';
import {
  ctaOccurrences,
  imageOccurrences,
  linkedPageIds,
  referencedAssetIds,
} from './content-refs.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccc';

describe('content references', () => {
  const benefits = sampleSection('benefits', 'grid', 'bene00000001');
  const items = (benefits.content['items'] as { image: { assetId: string | null } }[]).map(
    (item, index) => (index === 1 ? { ...item, image: { ...item.image, assetId: B } } : item),
  );
  const page = composition([
    heroSection({
      variant: 'centered',
      image: { assetId: A, alt: '', decorative: false },
      ctaLink: { kind: 'page', pageId: C },
      secondaryLabel: 'Bảng giá',
      secondaryLink: { kind: 'page', pageId: C },
    }),
    { ...benefits, content: { ...benefits.content, items } },
  ]);

  it('finds images in every stored field, including fields the variant hides', () => {
    expect(imageOccurrences(page)).toEqual([
      { sectionIndex: 0, path: 'image', image: { assetId: A, alt: '', decorative: false } },
      {
        sectionIndex: 1,
        path: 'items.1.image',
        image: { assetId: B, alt: '', decorative: false },
      },
    ]);
  });

  it('lists distinct asset ids including the share image', () => {
    expect(
      referencedAssetIds({ composition: page, seo: cleanSeo({ shareImageAssetId: A }) }),
    ).toEqual([A, B]);
    expect(
      referencedAssetIds({ composition: page, seo: cleanSeo({ shareImageAssetId: C }) }),
    ).toEqual([A, B, C]);
  });

  it('lists buttons and the distinct pages they lead to', () => {
    expect(ctaOccurrences(page).map((cta) => cta.path)).toEqual(['primaryCta', 'secondaryCta']);
    expect(linkedPageIds(page)).toEqual([C]);
  });

  it('finds nothing in an empty page', () => {
    expect(imageOccurrences(composition([]))).toEqual([]);
    expect(linkedPageIds(composition([]))).toEqual([]);
  });
});

import { type ChangeItem, EMPTY_SEO, type SectionInstance } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  cleanSeo,
  composition,
  heroSection,
  sampleSection,
} from '../../../../test/compositions.js';
import { diffSnapshots } from './diff-snapshots.js';
import { emptyPageSnapshot, type PageSnapshot } from './snapshot.js';

function snapshot(
  sections: SectionInstance[],
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return { slug: 'uu-dai', composition: composition(sections), seo: cleanSeo(), ...overrides };
}

function labels(changes: ChangeItem[]): string[] {
  return changes.map((change) => change.label);
}

describe('diffSnapshots', () => {
  const hero = heroSection({ id: 'hero00000001' });
  const benefits = sampleSection('benefits', 'grid', 'bene00000001');
  const faq = sampleSection('faq', undefined, 'faqs00000001');

  it('finds nothing between identical snapshots', () => {
    const base = snapshot([hero, benefits, faq]);
    expect(diffSnapshots(base, structuredClone(base))).toEqual([]);
  });

  it('ignores the key order of stored content', () => {
    const reordered: SectionInstance = {
      ...hero,
      content: Object.fromEntries(Object.entries(hero.content).reverse()),
    };
    expect(diffSnapshots(snapshot([hero]), snapshot([reordered]))).toEqual([]);
  });

  it('reports added and removed sections with their definition label', () => {
    const changes = diffSnapshots(snapshot([hero, benefits]), snapshot([hero, faq]));
    expect(changes).toEqual([
      { kind: 'added', label: 'Thêm: Câu hỏi thường gặp', sectionId: faq.id },
      { kind: 'removed', label: 'Xóa: Lợi ích', sectionId: benefits.id },
    ]);
  });

  it.each([
    ['content', { content: { ...hero.content, heading: 'Tiêu đề mới' } }],
    ['variant', { variant: 'centered' }],
    ['colorScheme', { colorScheme: 'dark' as const }],
    ['spacing', { spacing: 'spacious' as const }],
    ['visibility', { visibility: { desktop: true, mobile: false } }],
    ['mobileOrder', { mobileOrder: 'media-first' as const }],
  ])('reports a %s change as "Sửa"', (_property, patch) => {
    const changes = diffSnapshots(snapshot([hero]), snapshot([{ ...hero, ...patch }]));
    expect(changes).toEqual([{ kind: 'modified', label: 'Sửa: Hero', sectionId: hero.id }]);
  });

  it('does not report a change of sample markers alone', () => {
    const changes = diffSnapshots(
      snapshot([hero]),
      snapshot([{ ...hero, samplePaths: ['heading'] }]),
    );
    expect(changes).toEqual([]);
  });

  it('reports the smallest set of moved sections', () => {
    const changes = diffSnapshots(snapshot([hero, benefits, faq]), snapshot([benefits, faq, hero]));
    expect(changes).toEqual([{ kind: 'moved', label: 'Đổi vị trí: Hero', sectionId: hero.id }]);
  });

  it('reports a moved and edited section once, as modified', () => {
    const edited = { ...benefits, colorScheme: 'brand' as const };
    const changes = diffSnapshots(snapshot([hero, benefits]), snapshot([edited, hero]));
    expect(labels(changes)).toEqual(['Sửa: Lợi ích']);
  });

  it('does not count a move caused only by an insertion or a removal', () => {
    expect(labels(diffSnapshots(snapshot([hero, faq]), snapshot([hero, benefits, faq])))).toEqual([
      'Thêm: Lợi ích',
    ]);
    expect(labels(diffSnapshots(snapshot([hero, benefits, faq]), snapshot([hero, faq])))).toEqual([
      'Xóa: Lợi ích',
    ]);
  });

  it('reports each SEO field and the slug', () => {
    const base = snapshot([hero]);
    const next = snapshot([hero], {
      slug: 'uu-dai-moi',
      seo: {
        title: 'Khác',
        description: 'Khác',
        shareImageAssetId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        noindex: true,
      },
    });
    expect(diffSnapshots(base, next)).toEqual([
      { kind: 'slug', label: 'Đường dẫn', sectionId: null },
      { kind: 'seo', label: 'SEO: tiêu đề', sectionId: null },
      { kind: 'seo', label: 'SEO: mô tả', sectionId: null },
      { kind: 'seo', label: 'SEO: ảnh chia sẻ', sectionId: null },
      { kind: 'seo', label: 'SEO: hiển thị tìm kiếm', sectionId: null },
    ]);
  });

  it('lists section changes in page order, then removals, slug and SEO', () => {
    const base = snapshot([hero, benefits, faq]);
    const next = snapshot(
      [{ ...hero, spacing: 'compact' }, faq, sampleSection('cta_band', undefined, 'ctab00000001')],
      {
        seo: { ...cleanSeo(), title: 'Mới' },
      },
    );
    expect(labels(diffSnapshots(base, next))).toEqual([
      'Sửa: Hero',
      'Thêm: Dải kêu gọi hành động',
      'Xóa: Lợi ích',
      'SEO: tiêu đề',
    ]);
  });

  it('describes a first release as additions to an empty page with the same slug', () => {
    const next = snapshot([hero, faq], { seo: EMPTY_SEO });
    expect(labels(diffSnapshots(emptyPageSnapshot(next.slug), next))).toEqual([
      'Thêm: Hero',
      'Thêm: Câu hỏi thường gặp',
    ]);
  });
});

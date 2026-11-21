import type { MarketplaceItemCard } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  cardPriceLabel,
  hasMarketplaceFilters,
  includedParts,
  NO_MARKETPLACE_FILTERS,
  priceText,
  visibleItems,
} from './marketplace-filters';
import { itemFixtures } from './test-fixtures';

function names(items: readonly MarketplaceItemCard[]): string[] {
  return items.map((item) => item.name);
}

describe('marketplace filters (board 30)', () => {
  it('lists the catalog in its order while every item has the same day', () => {
    expect(names(visibleItems(itemFixtures, NO_MARKETPLACE_FILTERS))).toEqual(names(itemFixtures));
  });

  it('sorts "Được dùng nhiều" by rank and keeps the catalog order within a rank', () => {
    const ranked = itemFixtures.map((item, index) => ({
      ...item,
      popularRank: index === 2 ? 1 : 2,
    }));
    expect(names(visibleItems(ranked, { ...NO_MARKETPLACE_FILTERS, sort: 'popular' }))).toEqual([
      'Spa ưu đãi ngày lễ',
      'Khai trương phòng tập',
      'Mở bán dự án căn hộ',
      'Khóa học tiếng Anh trẻ em',
    ]);
  });

  it('sorts "Mới cập nhật" by the day of the current version', () => {
    const dated = itemFixtures.map((item, index) => ({
      ...item,
      releasedOn: ['2026-10-01', '2026-11-05', '2026-09-30', '2026-11-05'][index] ?? '2026-01-01',
    }));
    expect(names(visibleItems(dated, NO_MARKETPLACE_FILTERS))).toEqual([
      'Mở bán dự án căn hộ',
      'Khóa học tiếng Anh trẻ em',
      'Khai trương phòng tập',
      'Spa ưu đãi ngày lễ',
    ]);
  });

  it('searches without accents in the name, description, industry and goal', () => {
    const search = (query: string) =>
      names(visibleItems(itemFixtures, { ...NO_MARKETPLACE_FILTERS, query }));
    expect(search('khai truong')).toEqual(['Khai trương phòng tập']);
    expect(search('spa')).toEqual(['Spa ưu đãi ngày lễ']);
    expect(search('bat dong san')).toEqual(['Mở bán dự án căn hộ']);
    expect(search('giao duc')).toEqual(['Khóa học tiếng Anh trẻ em']);
    expect(search('thu y')).toEqual([]);
  });

  it('filters by price and by the industry of the chip', () => {
    expect(names(visibleItems(itemFixtures, { ...NO_MARKETPLACE_FILTERS, price: 'free' }))).toEqual(
      ['Khóa học tiếng Anh trẻ em'],
    );
    expect(visibleItems(itemFixtures, { ...NO_MARKETPLACE_FILTERS, price: 'paid' })).toHaveLength(
      3,
    );
    expect(
      names(visibleItems(itemFixtures, { ...NO_MARKETPLACE_FILTERS, industry: 'spa_beauty' })),
    ).toEqual(['Spa ưu đãi ngày lễ']);
    expect(
      visibleItems(itemFixtures, {
        ...NO_MARKETPLACE_FILTERS,
        industry: 'spa_beauty',
        price: 'free',
      }),
    ).toEqual([]);
  });

  it('says when a search or filter is on', () => {
    expect(hasMarketplaceFilters(NO_MARKETPLACE_FILTERS)).toBe(false);
    expect(hasMarketplaceFilters({ ...NO_MARKETPLACE_FILTERS, query: ' ' })).toBe(false);
    expect(hasMarketplaceFilters({ ...NO_MARKETPLACE_FILTERS, price: 'paid' })).toBe(true);
    expect(hasMarketplaceFilters({ ...NO_MARKETPLACE_FILTERS, industry: 'education' })).toBe(true);
  });

  it('writes prices as the boards do', () => {
    expect(priceText(399000)).toBe('399.000đ');
    expect(priceText(0)).toBe('Miễn phí');
    expect(cardPriceLabel({ price: 399000, owned: true })).toBe('Đã sở hữu');
  });
});

describe('includedParts (board 31, "Gồm những gì")', () => {
  it('counts sections and distinct color schemes, and names the form only when there is one', () => {
    const sections = itemFixtures[0]?.sections ?? [];
    const schemes = new Set(sections.map((section) => section.colorScheme)).size;
    expect(includedParts({ sections, hasForm: true })).toEqual([
      `${sections.length} section`,
      `${schemes} bộ màu đạt AA`,
      'chữ mẫu tiếng Việt',
      'form thu lead',
    ]);
    expect(includedParts({ sections, hasForm: false })).not.toContain('form thu lead');
    expect(includedParts({ sections, hasForm: false }).join(' ')).not.toContain('ảnh');
  });
});

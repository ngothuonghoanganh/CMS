import {
  type MarketplaceItemCard,
  type MarketplacePriceFilter,
  type MarketplaceSort,
  type TemplateIndustry,
} from '@plp/contracts';
import { formatCount } from '../../lib/format';
import { matchesQuery } from '../templates/library-filters';

/*
 * Board 30 as pure functions: the search without accents, the price filter, the industry chip and
 * the sort. They run in the admin over the whole catalog (at most 100 items, ADR-036).
 */

export interface MarketplaceQuery {
  query: string;
  price: MarketplacePriceFilter;
  /** The chip pressed; null is "Tất cả". */
  industry: TemplateIndustry | null;
  sort: MarketplaceSort;
}

export const NO_MARKETPLACE_FILTERS: MarketplaceQuery = {
  query: '',
  price: 'all',
  industry: null,
  sort: 'recent',
};

export function hasMarketplaceFilters({ query, price, industry }: MarketplaceQuery): boolean {
  return query.trim() !== '' || price !== 'all' || industry !== null;
}

function passesPrice(item: MarketplaceItemCard, price: MarketplacePriceFilter): boolean {
  return price === 'all' || (price === 'free' ? item.price === 0 : item.price > 0);
}

/**
 * The cards to show. `Array.prototype.sort` is stable, so equal dates and equal ranks keep the
 * catalog's order, which is the order the API lists them in.
 */
export function visibleItems(
  items: readonly MarketplaceItemCard[],
  { query, price, industry, sort }: MarketplaceQuery,
): MarketplaceItemCard[] {
  return items
    .filter(
      (item) =>
        matchesQuery(item, query) &&
        passesPrice(item, price) &&
        (industry === null || item.industry === industry),
    )
    .sort((a, b) =>
      sort === 'popular'
        ? a.popularRank - b.popularRank
        : // "YYYY-MM-DD" compares as text, newest first.
          b.releasedOn.localeCompare(a.releasedOn),
    );
}

/** "399.000đ" (VAT included), or "Miễn phí". */
export function priceText(price: number): string {
  return price === 0 ? 'Miễn phí' : `${formatCount(price)}đ`;
}

/** The price on a card, or "Đã sở hữu" once the workspace holds the item (MP2). */
export function cardPriceLabel(item: Pick<MarketplaceItemCard, 'price' | 'owned'>): string {
  return item.owned ? 'Đã sở hữu' : priceText(item.price);
}

/**
 * "Gồm những gì" of board 31, read off the page: its sections, the color schemes it uses (every
 * scheme of a theme passes AA, §2.1), the sample texts in Vietnamese, and the lead form when it
 * has one. There are no images, so there is no "ảnh minh họa".
 */
export function includedParts(item: Pick<MarketplaceItemCard, 'sections' | 'hasForm'>): string[] {
  const schemes = new Set(item.sections.map((section) => section.colorScheme));
  return [
    `${item.sections.length} section`,
    `${schemes.size} bộ màu đạt AA`,
    'chữ mẫu tiếng Việt',
    ...(item.hasForm ? ['form thu lead'] : []),
  ];
}

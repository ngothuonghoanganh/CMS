import type { MarketplaceCatalog, MarketplaceItem, MarketplaceLicence } from '@plp/contracts';
import { compositionOutline } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  V2_HEADING,
  WITHDRAWN_ITEM_ID,
} from '../../../../test/marketplace.js';
import {
  currentVersionOf,
  itemVisibleTo,
  type MarketplaceHoldings,
  marketplaceDetail,
  marketplaceList,
  NO_HOLDINGS,
  popularRankOf,
} from './marketplace-items.js';

const catalog: MarketplaceCatalog = testMarketplaceCatalog();

function itemOf(id: string): MarketplaceItem {
  const item = catalog.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`No item "${id}"`);
  }
  return item;
}

const LICENCE: MarketplaceLicence = {
  source: 'purchase',
  version: 1,
  termsVersion: 1,
  grantedAt: '2026-11-21T08:00:00.000Z',
};

function holding(
  licences: Record<string, MarketplaceLicence>,
  counts: Record<string, number> = {},
): MarketplaceHoldings {
  return {
    licences: new Map(Object.entries(licences)),
    licenceCounts: new Map(Object.entries(counts)),
  };
}

describe('marketplace items (ADR-036)', () => {
  it('are at their last version', () => {
    expect(currentVersionOf(itemOf(TWO_VERSIONS_ITEM_ID))).toMatchObject({
      version: 2,
      releasedOn: '2026-10-20',
      note: 'Đổi tiêu đề của Hero.',
    });
    expect(currentVersionOf(itemOf('mp-khai-truong-phong-tap')).version).toBe(1);
  });

  it('are seen when listed; a draft never; a withdrawn item only with its licence', () => {
    expect(itemVisibleTo(itemOf('mp-khai-truong-phong-tap'), false)).toBe(true);
    expect(itemVisibleTo(itemOf(DRAFT_ITEM_ID), false)).toBe(false);
    expect(itemVisibleTo(itemOf(DRAFT_ITEM_ID), true)).toBe(false);
    expect(itemVisibleTo(itemOf(WITHDRAWN_ITEM_ID), false)).toBe(false);
    expect(itemVisibleTo(itemOf(WITHDRAWN_ITEM_ID), true)).toBe(true);
  });
});

describe('"Được dùng nhiều"', () => {
  const listed = catalog.items.filter((item) => item.status === 'listed');

  it('ranks every item first while no workspace holds a licence', () => {
    for (const item of listed) {
      expect(popularRankOf(item.id, listed, new Map())).toBe(1);
    }
  });

  it('ranks by the workspaces holding a licence, equal counts sharing a rank', () => {
    const counts = new Map([
      ['mp-mo-ban-du-an-can-ho', 7],
      ['mp-spa-uu-dai-ngay-le', 3],
      ['mp-khoa-hoc-tieng-anh-tre-em', 3],
    ]);
    expect(listed.map((item) => [item.id, popularRankOf(item.id, listed, counts)])).toEqual([
      ['mp-khai-truong-phong-tap', 4],
      ['mp-mo-ban-du-an-can-ho', 1],
      ['mp-spa-uu-dai-ngay-le', 2],
      ['mp-khoa-hoc-tieng-anh-tre-em', 2],
      [TWO_VERSIONS_ITEM_ID, 4],
    ]);
  });
});

describe('board 30', () => {
  it('lists the listed items in the catalog’s order, at their current version', () => {
    const { items, ownedCount } = marketplaceList(catalog, NO_HOLDINGS);
    expect(items.map((item) => item.id)).toEqual([
      'mp-khai-truong-phong-tap',
      'mp-mo-ban-du-an-can-ho',
      'mp-spa-uu-dai-ngay-le',
      'mp-khoa-hoc-tieng-anh-tre-em',
      TWO_VERSIONS_ITEM_ID,
    ]);
    expect(ownedCount).toBe(0);
    const twice = items.at(-1);
    const current = currentVersionOf(itemOf(TWO_VERSIONS_ITEM_ID));
    expect(twice).toEqual({
      id: TWO_VERSIONS_ITEM_ID,
      version: 2,
      releasedOn: '2026-10-20',
      name: 'Mẫu có hai phiên bản',
      description: itemOf(TWO_VERSIONS_ITEM_ID).description,
      goal: 'event',
      industry: 'fitness',
      price: 150_000,
      hasForm: true,
      sections: compositionOutline(current.composition),
      owned: false,
      popularRank: 1,
    });
    expect(twice?.sections[1]?.label).toBe(`Hero · “${V2_HEADING}”`);
    expect(items.map((item) => [item.price, item.hasForm])).toEqual([
      [399_000, true],
      [499_000, true],
      [299_000, false],
      [0, true],
      [150_000, true],
    ]);
  });

  it('says which items the workspace holds and counts them, withdrawn ones included', () => {
    const { items, ownedCount } = marketplaceList(
      catalog,
      holding({ 'mp-spa-uu-dai-ngay-le': LICENCE, [WITHDRAWN_ITEM_ID]: LICENCE }),
    );
    expect(items.filter((item) => item.owned).map((item) => item.id)).toEqual([
      'mp-spa-uu-dai-ngay-le',
    ]);
    expect(items.map((item) => item.id)).not.toContain(WITHDRAWN_ITEM_ID);
    expect(ownedCount).toBe(2);
  });
});

describe('board 31', () => {
  it('details a listed item with its preview, note and terms, and no licence', () => {
    const detail = marketplaceDetail(catalog, TWO_VERSIONS_ITEM_ID, NO_HOLDINGS);
    const current = currentVersionOf(itemOf(TWO_VERSIONS_ITEM_ID));
    expect(detail).toMatchObject({
      id: TWO_VERSIONS_ITEM_ID,
      version: 2,
      note: 'Đổi tiêu đề của Hero.',
      composition: current.composition,
      terms: catalog.terms,
      withdrawn: false,
      licence: null,
      owned: false,
    });
  });

  it('finds no draft, no withdrawn item without its licence, and nothing outside the catalog', () => {
    for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co', 'nha-khoa-uu-dai', '']) {
      expect(marketplaceDetail(catalog, id, NO_HOLDINGS), id).toBeNull();
    }
    expect(
      marketplaceDetail(catalog, DRAFT_ITEM_ID, holding({ [DRAFT_ITEM_ID]: LICENCE })),
    ).toBeNull();
  });

  it('shows a withdrawn item to the workspace holding its licence, saying it is withdrawn', () => {
    expect(
      marketplaceDetail(catalog, WITHDRAWN_ITEM_ID, holding({ [WITHDRAWN_ITEM_ID]: LICENCE })),
    ).toMatchObject({ withdrawn: true, owned: true, licence: LICENCE });
  });
});

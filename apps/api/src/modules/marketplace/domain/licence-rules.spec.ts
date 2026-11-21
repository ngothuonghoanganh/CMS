import type { MarketplaceCatalog, MarketplaceItem, MarketplaceItemVersion } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../../test/marketplace.js';
import { claimOutcome, versionUpdateOutcome } from './licence-rules.js';

const catalog: MarketplaceCatalog = testMarketplaceCatalog();
const FREE_ID = 'mp-khoa-hoc-tieng-anh-tre-em';
const HELD = { version: 1 };
const SEEN = { version: 1, termsVersion: 1 };

function itemOf(id: string, from: MarketplaceCatalog = catalog): MarketplaceItem {
  const item = from.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`No item "${id}"`);
  }
  return item;
}

function versionOf(item: MarketplaceItem, version: number): MarketplaceItemVersion {
  const found = item.versions.find((candidate) => candidate.version === version);
  if (found === undefined) {
    throw new Error(`No ${item.id} v${version}`);
  }
  return found;
}

/** The catalog with the free item changed. */
function withFreeItem(change: Partial<MarketplaceItem>): MarketplaceCatalog {
  return {
    ...catalog,
    items: catalog.items.map((item) => (item.id === FREE_ID ? { ...item, ...change } : item)),
  };
}

describe('"Nhận mẫu" (ADR-036)', () => {
  it('grants the free item at its current version under the current terms', () => {
    const outcome = claimOutcome(catalog, FREE_ID, null, SEEN);
    expect(outcome).toMatchObject({ kind: 'grant', termsVersion: 1 });
    expect(outcome.kind === 'grant' && outcome.item.id).toBe(FREE_ID);
    expect(outcome.kind === 'grant' && outcome.version.version).toBe(1);
  });

  it('finds no draft, no withdrawn item it does not hold, and nothing outside the catalog', () => {
    for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co', 'nha-khoa-uu-dai']) {
      expect(claimOutcome(catalog, id, null, SEEN), id).toEqual({ kind: 'not_found' });
    }
    expect(claimOutcome(catalog, DRAFT_ITEM_ID, HELD, SEEN)).toEqual({ kind: 'not_found' });
  });

  it('answers with the licence held, whatever the item became and whatever was seen', () => {
    for (const id of [FREE_ID, 'mp-khai-truong-phong-tap', WITHDRAWN_ITEM_ID]) {
      expect(claimOutcome(catalog, id, HELD, { version: 9, termsVersion: 9 }), id).toEqual({
        kind: 'held',
        licence: HELD,
      });
    }
  });

  it('refuses an item with a price, before looking at what was seen', () => {
    for (const id of ['mp-khai-truong-phong-tap', TWO_VERSIONS_ITEM_ID]) {
      const outcome = claimOutcome(catalog, id, null, { version: 9, termsVersion: 9 });
      expect(outcome.kind, id).toBe('not_free');
    }
  });

  it('refuses another version or other terms, saying what they are now', () => {
    const v2 = withFreeItem({
      versions: [
        ...itemOf(FREE_ID).versions,
        { ...versionOf(itemOf(FREE_ID), 1), version: 2, note: 'Bản mới.' },
      ],
    });
    expect(claimOutcome(v2, FREE_ID, null, SEEN)).toMatchObject({
      kind: 'changed',
      current: { version: 2, price: 0, termsVersion: 1 },
    });
    const terms = { ...catalog, terms: { ...catalog.terms, version: 2 } };
    expect(claimOutcome(terms, FREE_ID, null, SEEN)).toMatchObject({
      kind: 'changed',
      current: { version: 1, price: 0, termsVersion: 2 },
    });
    expect(claimOutcome(catalog, FREE_ID, null, { version: 2, termsVersion: 1 }).kind).toBe(
      'changed',
    );
  });
});

describe('"Cập nhật" of a licence (ADR-036)', () => {
  const twice = itemOf(TWO_VERSIONS_ITEM_ID);

  it('moves forward to the current version from the version the member saw', () => {
    const outcome = versionUpdateOutcome(twice, 1, 1);
    expect(outcome.kind).toBe('move');
    expect(outcome.kind === 'move' && outcome.to.version).toBe(2);
  });

  it('changes nothing at the current version, whatever was seen', () => {
    expect(versionUpdateOutcome(twice, 2, 2)).toEqual({ kind: 'latest' });
    expect(versionUpdateOutcome(twice, 2, 1)).toEqual({ kind: 'latest' });
    expect(versionUpdateOutcome(itemOf('mp-khai-truong-phong-tap'), 1, 1)).toEqual({
      kind: 'latest',
    });
  });

  it('refuses when the licence is no longer at the version the member saw', () => {
    const three = {
      ...twice,
      versions: [...twice.versions, { ...versionOf(twice, 2), version: 3, note: 'Bản ba.' }],
    };
    expect(versionUpdateOutcome(three, 2, 1)).toEqual({ kind: 'changed', licenceVersion: 2 });
    expect(versionUpdateOutcome(three, 1, 2)).toEqual({ kind: 'changed', licenceVersion: 1 });
  });

  it('updates a withdrawn item too', () => {
    const withdrawn = { ...twice, status: 'withdrawn' as const };
    expect(versionUpdateOutcome(withdrawn, 1, 1).kind).toBe('move');
  });
});

import type {
  MarketplaceCatalog,
  MarketplaceItem,
  MarketplacePurchaseRequest,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  PAID_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../../test/marketplace.js';
import { purchaseOutcome, quoteOutcome, suggestionOutcome } from './purchase-rules.js';

const catalog: MarketplaceCatalog = testMarketplaceCatalog();
const HELD = { version: 1 };
const QUOTED: MarketplacePurchaseRequest = {
  itemId: PAID_ITEM_ID,
  version: 1,
  expectedAmount: 399_000,
  termsVersion: 1,
};

/** The catalog with one item changed. */
function withItem(id: string, change: Partial<MarketplaceItem>): MarketplaceCatalog {
  return {
    ...catalog,
    items: catalog.items.map((item) => (item.id === id ? { ...item, ...change } : item)),
  };
}

describe('"Mua mẫu": the quote (ADR-036, MP3)', () => {
  it('quotes a paid item at its current version, and an item held as owned', () => {
    expect(quoteOutcome(catalog, PAID_ITEM_ID, null)).toMatchObject({
      kind: 'quote',
      version: 1,
      licence: null,
      item: { id: PAID_ITEM_ID, price: 399_000 },
    });
    expect(quoteOutcome(catalog, TWO_VERSIONS_ITEM_ID, null)).toMatchObject({ version: 2 });
    for (const id of [PAID_ITEM_ID, FREE_ITEM_ID, WITHDRAWN_ITEM_ID]) {
      expect(quoteOutcome(catalog, id, HELD), id).toMatchObject({ kind: 'quote', licence: HELD });
    }
  });

  it('sends a free item to "Nhận mẫu", and finds nothing it may not see', () => {
    expect(quoteOutcome(catalog, FREE_ITEM_ID, null)).toMatchObject({ kind: 'free' });
    for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co', 'nha-khoa-uu-dai']) {
      expect(quoteOutcome(catalog, id, null), id).toEqual({ kind: 'not_found' });
    }
    expect(quoteOutcome(catalog, DRAFT_ITEM_ID, HELD)).toEqual({ kind: 'not_found' });
  });
});

describe('"Mua mẫu": the checks of a purchase, in order (ADR-036, MP3)', () => {
  it('buys the item at the version, price and terms of the quote', () => {
    expect(purchaseOutcome(catalog, QUOTED, null, true)).toMatchObject({
      kind: 'buy',
      version: 1,
      termsVersion: 1,
      item: { id: PAID_ITEM_ID },
    });
  });

  it('sells only a listed item: a withdrawn one is not found, even to its holder', () => {
    for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co']) {
      expect(purchaseOutcome(catalog, { ...QUOTED, itemId: id }, null, true), id).toEqual({
        kind: 'not_found',
      });
      expect(purchaseOutcome(catalog, { ...QUOTED, itemId: id }, HELD, false), id).toEqual({
        kind: 'not_found',
      });
    }
  });

  it('answers a held item before its price, the gateway and the quote', () => {
    expect(
      purchaseOutcome(catalog, { ...QUOTED, itemId: FREE_ITEM_ID, version: 9 }, HELD, false),
    ).toMatchObject({ kind: 'owned', licence: HELD });
  });

  it('sends a free item to "Nhận mẫu" before asking whether payments are on', () => {
    expect(
      purchaseOutcome(catalog, { ...QUOTED, itemId: FREE_ITEM_ID }, null, false),
    ).toMatchObject({ kind: 'free' });
  });

  it('refuses with payments off before comparing the quote', () => {
    expect(purchaseOutcome(catalog, { ...QUOTED, version: 9 }, null, false)).toEqual({
      kind: 'disabled',
    });
  });

  it('asks again when the version, the price or the terms moved since the quote', () => {
    const changed = { kind: 'changed', current: { version: 1, price: 399_000, termsVersion: 1 } };
    expect(purchaseOutcome(catalog, { ...QUOTED, version: 2 }, null, true)).toMatchObject(changed);
    expect(purchaseOutcome(catalog, { ...QUOTED, expectedAmount: 1 }, null, true)).toMatchObject(
      changed,
    );
    expect(purchaseOutcome(catalog, { ...QUOTED, termsVersion: 2 }, null, true)).toMatchObject(
      changed,
    );
    const repriced = withItem(PAID_ITEM_ID, { price: 450_000 });
    expect(purchaseOutcome(repriced, QUOTED, null, true)).toMatchObject({
      kind: 'changed',
      current: { price: 450_000 },
    });
  });
});

describe('"Đề xuất mua": the checks of a suggestion, in order (ADR-036, MP3)', () => {
  it('asks for an item on sale with a price that the workspace does not hold', () => {
    expect(suggestionOutcome(catalog, PAID_ITEM_ID, null)).toMatchObject({
      kind: 'suggest',
      item: { id: PAID_ITEM_ID, price: 399_000 },
    });
  });

  it('finds nothing it may not see, whatever the licence it holds of a draft', () => {
    for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co', 'nha-khoa-uu-dai']) {
      expect(suggestionOutcome(catalog, id, null), id).toEqual({ kind: 'not_found' });
    }
    expect(suggestionOutcome(catalog, DRAFT_ITEM_ID, HELD)).toEqual({ kind: 'not_found' });
  });

  it('answers owned before free, withdrawn items held included', () => {
    for (const id of [PAID_ITEM_ID, FREE_ITEM_ID, WITHDRAWN_ITEM_ID]) {
      expect(suggestionOutcome(catalog, id, HELD), id).toMatchObject({
        kind: 'owned',
        licence: HELD,
      });
    }
  });

  it('sends a free item to "Nhận mẫu": nobody needs to ask for it', () => {
    expect(suggestionOutcome(catalog, FREE_ITEM_ID, null)).toMatchObject({ kind: 'free' });
  });
});

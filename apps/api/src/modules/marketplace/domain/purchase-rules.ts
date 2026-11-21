import type {
  MarketplaceCatalog,
  MarketplaceItem,
  MarketplaceItemChangedProblemContext,
  MarketplacePurchaseRequest,
} from '@plp/contracts';
import { currentVersionOf, findMarketplaceItem, itemVisibleTo } from './marketplace-items.js';

/*
 * The rules of "Mua mẫu" (ADR-036, MP3), as pure functions of the catalog, the workspace's licence
 * and the request, in the order the ADR checks them. Membership (404), `billing.manage` (403) and
 * a read-only workspace (402) come before them; the saved card (422) after, with the plan's facts.
 */

/** What the quote of an item answers, `L` being the workspace's licence. */
export type QuoteOutcome<L> =
  /** The workspace may not see the item: a draft, withdrawn and not held, or not in the catalog. */
  | { kind: 'not_found' }
  /** Not held, and free: "Nhận mẫu", not "Mua mẫu" (409 `item_free`). */
  | { kind: 'free'; item: MarketplaceItem }
  /** The price of the current version under the current terms; `licence` when it is held. */
  | { kind: 'quote'; item: MarketplaceItem; version: number; licence: L | null };

/** The quote of "Mua mẫu": an item held answers as owned, whatever its price now. */
export function quoteOutcome<L>(
  catalog: MarketplaceCatalog,
  itemId: string,
  held: L | null,
): QuoteOutcome<L> {
  const item = findMarketplaceItem(catalog, itemId);
  if (item === undefined || !itemVisibleTo(item, held !== null)) {
    return { kind: 'not_found' };
  }
  if (held === null && item.price === 0) {
    return { kind: 'free', item };
  }
  return { kind: 'quote', item, version: currentVersionOf(item).version, licence: held };
}

/** What a purchase does, before the card and the hold, `L` being the workspace's licence. */
export type PurchaseOutcome<L> =
  /** Not on sale: a draft, withdrawn (held or not) or not in the catalog (404). */
  | { kind: 'not_found' }
  /** The workspace holds it already (409 `item_owned`). */
  | { kind: 'owned'; item: MarketplaceItem; licence: L }
  /** A free item is claimed, not bought (409 `item_free`). */
  | { kind: 'free'; item: MarketplaceItem }
  /** `PAYMENT_PROVIDER=none` (503 `payments_disabled`). */
  | { kind: 'disabled' }
  /** The version, the price or the terms are not those of the quote (409 `item_changed`). */
  | { kind: 'changed'; item: MarketplaceItem; current: MarketplaceItemChangedProblemContext }
  /** The current version at the current price, under the current terms. */
  | { kind: 'buy'; item: MarketplaceItem; version: number; termsVersion: number };

/**
 * The checks of a purchase in ADR-036's order: the item on sale (404), not held (409
 * `item_owned`), with a price (409 `item_free`), the gateway on (503), then the version, price and
 * terms of the quote (409 `item_changed`).
 */
export function purchaseOutcome<L>(
  catalog: MarketplaceCatalog,
  request: MarketplacePurchaseRequest,
  held: L | null,
  paymentsEnabled: boolean,
): PurchaseOutcome<L> {
  const item = findMarketplaceItem(catalog, request.itemId);
  if (item?.status !== 'listed') {
    return { kind: 'not_found' };
  }
  if (held !== null) {
    return { kind: 'owned', item, licence: held };
  }
  if (item.price === 0) {
    return { kind: 'free', item };
  }
  if (!paymentsEnabled) {
    return { kind: 'disabled' };
  }
  const current = currentVersionOf(item);
  if (
    request.version !== current.version ||
    request.expectedAmount !== item.price ||
    request.termsVersion !== catalog.terms.version
  ) {
    return {
      kind: 'changed',
      item,
      current: {
        version: current.version,
        price: item.price,
        termsVersion: catalog.terms.version,
      },
    };
  }
  return { kind: 'buy', item, version: current.version, termsVersion: catalog.terms.version };
}

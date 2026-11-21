import type {
  ClaimMarketplaceItemRequest,
  MarketplaceCatalog,
  MarketplaceItem,
  MarketplaceItemChangedProblemContext,
  MarketplaceItemVersion,
} from '@plp/contracts';
import { currentVersionOf, findMarketplaceItem, itemVisibleTo } from './marketplace-items.js';

/*
 * The rules of "Nhận mẫu" and "Cập nhật" (ADR-036), as pure functions of the catalog, the
 * workspace's licence and the request. Membership, permission and a read-only workspace are
 * checked before them.
 */

/** What "Nhận mẫu" of an item does, `L` being the workspace's licence. */
export type ClaimOutcome<L> =
  /** The workspace may not see the item: a draft, withdrawn and not held, or not in the catalog. */
  | { kind: 'not_found' }
  /** It holds the item already: that licence answers, unchanged. */
  | { kind: 'held'; licence: L }
  /** A paid item is bought, not claimed (409 `item_not_free`). */
  | { kind: 'not_free'; item: MarketplaceItem }
  /** The member saw another version or other terms (409 `item_changed`): what they are now. */
  | { kind: 'changed'; item: MarketplaceItem; current: MarketplaceItemChangedProblemContext }
  /** A free licence at the item's current version, under the current terms. */
  | { kind: 'grant'; item: MarketplaceItem; version: MarketplaceItemVersion; termsVersion: number };

/**
 * A licence held answers before anything else: claiming again changes nothing, even once the
 * item has a new version, a price or new terms.
 */
export function claimOutcome<L>(
  catalog: MarketplaceCatalog,
  itemId: string,
  held: L | null,
  request: ClaimMarketplaceItemRequest,
): ClaimOutcome<L> {
  const item = findMarketplaceItem(catalog, itemId);
  if (item === undefined || !itemVisibleTo(item, held !== null)) {
    return { kind: 'not_found' };
  }
  if (held !== null) {
    return { kind: 'held', licence: held };
  }
  // Seen and not held: the item is listed.
  if (item.price > 0) {
    return { kind: 'not_free', item };
  }
  const current = currentVersionOf(item);
  if (request.version !== current.version || request.termsVersion !== catalog.terms.version) {
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
  return { kind: 'grant', item, version: current, termsVersion: catalog.terms.version };
}

/** What "Cập nhật" of a licence does. */
export type VersionUpdateOutcome =
  /** The licence is at the item's current version: unchanged. */
  | { kind: 'latest' }
  /** It is no longer at the version the member saw (409 `template_changed` with this one). */
  | { kind: 'changed'; licenceVersion: number }
  /** It moves forward to the item's current version. */
  | { kind: 'move'; to: MarketplaceItemVersion };

/**
 * Forward only: a licence moves to the item's current version, never back to an older one, and
 * only from the version whose newer notes the member read (`baseVersion`). A withdrawn item
 * updates too: its holders keep using it.
 */
export function versionUpdateOutcome(
  item: MarketplaceItem,
  licenceVersion: number,
  baseVersion: number,
): VersionUpdateOutcome {
  const current = currentVersionOf(item);
  if (licenceVersion >= current.version) {
    return { kind: 'latest' };
  }
  if (licenceVersion !== baseVersion) {
    return { kind: 'changed', licenceVersion };
  }
  return { kind: 'move', to: current };
}

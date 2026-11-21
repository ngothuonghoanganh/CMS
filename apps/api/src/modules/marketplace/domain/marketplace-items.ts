import type {
  MarketplaceCatalog,
  MarketplaceItem,
  MarketplaceItemCard,
  MarketplaceItemDetail,
  MarketplaceItemVersion,
  MarketplaceLicence,
  MarketplaceListResponse,
  MarketplaceOwnedItem,
} from '@plp/contracts';
import { compositionHasForm, compositionOutline } from '@plp/sections/schema';

/*
 * What boards 30, 31 and 32 show of the catalog (ADR-036), as pure functions of the catalog and of
 * what the workspaces hold of it.
 */

/** What the workspace, and every workspace, hold of the catalog. */
export interface MarketplaceHoldings {
  /** The workspace's licences, by item id, withdrawn items included. */
  licences: ReadonlyMap<string, MarketplaceLicence>;
  /** How many workspaces hold a licence of each item, by item id; an absent item has none. */
  licenceCounts: ReadonlyMap<string, number>;
}

/** Nothing held anywhere. */
export const NO_HOLDINGS: MarketplaceHoldings = { licences: new Map(), licenceCounts: new Map() };

/** The catalog's item with this id; undefined for any other id. */
export function findMarketplaceItem(
  catalog: MarketplaceCatalog,
  itemId: string,
): MarketplaceItem | undefined {
  return catalog.items.find((item) => item.id === itemId);
}

/** The item's version `version`; undefined when the catalog has no such version of it. */
export function itemVersionOf(
  item: MarketplaceItem,
  version: number,
): MarketplaceItemVersion | undefined {
  return item.versions.find((candidate) => candidate.version === version);
}

/** The last version: the catalog numbers them one after another from 1. */
export function currentVersionOf(item: MarketplaceItem): MarketplaceItemVersion {
  const current = item.versions.at(-1);
  if (current === undefined) {
    throw new Error(`Marketplace item ${item.id} has no version`);
  }
  return current;
}

/**
 * Whether the workspace may see the item: a draft never, a withdrawn item only with its licence,
 * so that the licence never loses its template.
 */
export function itemVisibleTo(item: MarketplaceItem, licensed: boolean): boolean {
  switch (item.status) {
    case 'draft':
      return false;
    case 'listed':
      return true;
    case 'withdrawn':
      return licensed;
  }
}

/** The items on sale, in the catalog's order: board 30, and the unowned cards of the library. */
export function listedItems(catalog: MarketplaceCatalog): MarketplaceItem[] {
  return catalog.items.filter((item) => item.status === 'listed');
}

/**
 * "Được dùng nhiều": 1 plus the listed items more workspaces hold a licence of, so items with as
 * many licences share a rank (1, 2, 2, 4), and every item ranks 1 while none is held.
 */
export function popularRankOf(
  itemId: string,
  listed: readonly MarketplaceItem[],
  licenceCounts: ReadonlyMap<string, number>,
): number {
  const count = licenceCounts.get(itemId) ?? 0;
  return 1 + listed.filter((item) => (licenceCounts.get(item.id) ?? 0) > count).length;
}

function cardOf(
  item: MarketplaceItem,
  listed: readonly MarketplaceItem[],
  holdings: MarketplaceHoldings,
): MarketplaceItemCard {
  const current = currentVersionOf(item);
  return {
    id: item.id,
    version: current.version,
    releasedOn: current.releasedOn,
    name: item.name,
    description: item.description,
    goal: item.goal,
    industry: item.industry,
    price: item.price,
    hasForm: compositionHasForm(current.composition),
    sections: compositionOutline(current.composition),
    owned: holdings.licences.has(item.id),
    popularRank: popularRankOf(item.id, listed, holdings.licenceCounts),
  };
}

/** Board 30: the listed items in the catalog's order, and how many items the workspace holds. */
export function marketplaceList(
  catalog: MarketplaceCatalog,
  holdings: MarketplaceHoldings,
): MarketplaceListResponse {
  const listed = listedItems(catalog);
  return {
    items: listed.map((item) => cardOf(item, listed, holdings)),
    ownedCount: holdings.licences.size,
  };
}

/** Board 31 without the owner's name, which the service reads only for an item it shows. */
export type MarketplaceItemView = Omit<MarketplaceItemDetail, 'ownerName'>;

/**
 * Board 31: the item at its current version, with its preview and the terms; null when the
 * workspace may not see it (`itemVisibleTo`) or it is not in the catalog.
 */
export function marketplaceDetail(
  catalog: MarketplaceCatalog,
  itemId: string,
  holdings: MarketplaceHoldings,
): MarketplaceItemView | null {
  const item = findMarketplaceItem(catalog, itemId);
  const licence = holdings.licences.get(itemId) ?? null;
  if (item === undefined || !itemVisibleTo(item, licence !== null)) {
    return null;
  }
  const current = currentVersionOf(item);
  return {
    ...cardOf(item, listedItems(catalog), holdings),
    composition: current.composition,
    note: current.note,
    terms: catalog.terms,
    withdrawn: item.status === 'withdrawn',
    licence,
  };
}

/**
 * A row of board 32: the item at its licence's version, with the notes of every version released
 * after it ("CÓ BẢN vM", the update dialog). The licence must name a version of the item, as the
 * startup check makes sure.
 */
export function ownedItemOf(
  item: MarketplaceItem,
  licence: MarketplaceLicence,
): MarketplaceOwnedItem {
  const held = itemVersionOf(item, licence.version);
  if (held === undefined) {
    throw new Error(
      `Marketplace item ${item.id} has no v${licence.version}, which a licence names`,
    );
  }
  return {
    itemId: item.id,
    name: item.name,
    source: licence.source,
    version: licence.version,
    latestVersion: currentVersionOf(item).version,
    newVersions: item.versions
      .filter((version) => version.version > licence.version)
      .map(({ version, releasedOn, note }) => ({ version, releasedOn, note })),
    grantedAt: licence.grantedAt,
    withdrawn: item.status === 'withdrawn',
    hasForm: compositionHasForm(held.composition),
    sections: compositionOutline(held.composition),
  };
}

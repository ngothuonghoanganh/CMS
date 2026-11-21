import { Injectable } from '@nestjs/common';
import type {
  MarketplaceCatalog,
  MarketplaceItem,
  MarketplaceItemVersion,
  MarketplaceLicence,
} from '@plp/contracts';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  findMarketplaceItem,
  itemVersionOf,
  listedItems,
  type MarketplaceHoldings,
} from './domain/marketplace-items.js';
import { InjectMarketplaceCatalog } from './marketplace-catalog.js';
import type { MarketplaceLicenceRecord } from './marketplace-licence.schema.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

/** The contract's form of a stored licence: what boards 31 and 32 show of it. */
export function toMarketplaceLicence(record: MarketplaceLicenceRecord): MarketplaceLicence {
  return {
    source: record.source,
    version: record.version,
    termsVersion: record.termsVersion,
    grantedAt: record.grantedAt.toISOString(),
  };
}

/** An item the workspace holds, at its licence's version. */
export interface LicensedMarketplaceItem {
  /** The catalog's item, at every version; `withdrawn` items included. */
  item: MarketplaceItem;
  licence: MarketplaceLicence;
  /** The item at the licence's version: what new pages and drafts are made from (ADR-036). */
  version: MarketplaceItemVersion;
}

/**
 * What a workspace holds of the marketplace (ADR-036), for the marketplace screens and for the
 * template library, the template screen, making a page and applying a template, which take a
 * marketplace item only with its licence and at its version. A workspace never reads another's
 * licences: everything goes through its scope, and an item it holds no licence of is `null`.
 */
@Injectable()
export class MarketplaceLicences {
  constructor(
    @InjectMarketplaceCatalog() readonly catalog: MarketplaceCatalog,
    private readonly repository: MarketplaceLicencesRepository,
  ) {}

  /** The items on sale, at every version, in the catalog's order. */
  listedItems(): MarketplaceItem[] {
    return listedItems(this.catalog);
  }

  /**
   * The workspace's licence of the item with the item at that version; null when the workspace
   * holds none, whatever the id (an item of the catalog or not).
   */
  async heldItem(
    scope: WorkspaceScope,
    itemId: string,
    tx?: Tx,
  ): Promise<LicensedMarketplaceItem | null> {
    const record = await this.repository.find(scope, itemId, tx);
    return record === null ? null : this.licensed(record);
  }

  /** Every item the workspace holds, withdrawn ones included, the newest licence first. */
  async heldItems(scope: WorkspaceScope): Promise<LicensedMarketplaceItem[]> {
    return (await this.repository.listOf(scope)).map((record) => this.licensed(record));
  }

  /**
   * The workspace's licences and how many workspaces hold each listed item: what board 30's
   * cards and board 31 show (`owned`, `ownedCount`, `popularRank`, `licence`).
   */
  async holdings(scope: WorkspaceScope): Promise<MarketplaceHoldings> {
    const [records, licenceCounts] = await Promise.all([
      this.repository.listOf(scope),
      this.repository.countsOf(this.listedItems().map((item) => item.id)),
    ]);
    return {
      licences: new Map(records.map((record) => [record.itemId, toMarketplaceLicence(record)])),
      licenceCounts,
    };
  }

  /**
   * The licence with its item. The startup check (`MarketplaceLicenceCheck`) refuses a catalog
   * without the item or the version a licence names, so a miss here is a broken invariant.
   */
  private licensed(record: MarketplaceLicenceRecord): LicensedMarketplaceItem {
    const item = findMarketplaceItem(this.catalog, record.itemId);
    const version = item === undefined ? undefined : itemVersionOf(item, record.version);
    if (item === undefined || version === undefined || item.status === 'draft') {
      throw new Error(
        `A licence names ${record.itemId} v${record.version}, which the marketplace catalog does not serve`,
      );
    }
    return { item, licence: toMarketplaceLicence(record), version };
  }
}

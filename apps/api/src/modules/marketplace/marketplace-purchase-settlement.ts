import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { MarketplaceCatalog } from '@plp/contracts';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { ItemStanding } from '../billing/domain/invoice-state.js';
import type { MarketplaceInvoiceRecord } from '../billing/invoice.schema.js';
import { MarketplacePurchaseHooks } from '../billing/marketplace-purchase-hooks.js';
import { findMarketplaceItem, itemVersionOf } from './domain/marketplace-items.js';
import { versionHashOf } from './domain/version-hash.js';
import { InjectMarketplaceCatalog } from './marketplace-catalog.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

/**
 * What a paid marketplace invoice grants (ADR-036), registered with billing at startup so billing
 * never imports the marketplace: the licence `purchase` at the invoice's version, with the hash of
 * that version's content, the invoice, the terms agreed to and the buyer. It runs in the
 * transaction that marks the invoice paid, whichever way it was paid (the API's charge, "Thanh
 * toán lại", the gateway's late event, the billing job), so there is never a licence without its
 * paid invoice, nor the other way round. It also tells billing whether an unpaid one still applies
 * and which items board 31 may be returned to.
 */
@Injectable()
export class MarketplacePurchaseSettlement implements OnModuleInit {
  constructor(
    @InjectMarketplaceCatalog() private readonly catalog: MarketplaceCatalog,
    private readonly hooks: MarketplacePurchaseHooks,
    private readonly licences: MarketplaceLicencesRepository,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      grant: (invoice, at, tx) => this.grant(invoice, at, tx),
      grantedBy: (invoice) => this.grantedBy(invoice),
      standings: (ref, itemIds, tx) => this.standings(ref, itemIds, tx),
      hasItem: (itemId) => {
        const item = findMarketplaceItem(this.catalog, itemId);
        return item !== undefined && item.status !== 'draft';
      },
    });
  }

  /**
   * Grants the licence unless the workspace holds one already; false then, and it stays as it was.
   * Read first: a duplicate key would abort the invoice's transaction (MP2).
   */
  private async grant(invoice: MarketplaceInvoiceRecord, at: Date, tx: Tx): Promise<boolean> {
    const ref = { workspaceId: invoice.workspaceId };
    const { itemId, version: number, termsVersion } = invoice.item;
    if ((await this.licences.find(ref, itemId, tx)) !== null) {
      return false;
    }
    const item = findMarketplaceItem(this.catalog, itemId);
    const version = item === undefined ? undefined : itemVersionOf(item, number);
    if (version === undefined) {
      // An item with an invoice is never taken out of the file; the payment waits until it is back.
      throw new Error(
        `Invoice ${invoice._id.toHexString()} pays for ${itemId} v${number}, which the marketplace catalog does not have`,
      );
    }
    const { granted } = await this.licences.grant(
      ref,
      {
        itemId,
        source: 'purchase',
        version: number,
        versionHash: versionHashOf(version.composition),
        invoiceId: invoice._id,
        termsVersion,
        grantedBy: invoice.createdBy,
        at,
      },
      tx,
    );
    return granted;
  }

  private async grantedBy(invoice: MarketplaceInvoiceRecord): Promise<boolean> {
    const held = await this.licences.find(
      { workspaceId: invoice.workspaceId },
      invoice.item.itemId,
    );
    return held?.invoiceId?.equals(invoice._id) === true;
  }

  /** On sale, the price, and held by the workspace: one read of its licences for every item. */
  private async standings(
    ref: WorkspaceRef,
    itemIds: readonly string[],
    tx?: Tx,
  ): Promise<Map<string, ItemStanding>> {
    const held = new Set(
      (await this.licences.findOfItems(ref, itemIds, tx)).map((licence) => licence.itemId),
    );
    return new Map(
      itemIds.map((itemId) => {
        const item = findMarketplaceItem(this.catalog, itemId);
        return [
          itemId,
          {
            listed: item?.status === 'listed',
            price: item?.price ?? 0,
            licensed: held.has(itemId),
          },
        ];
      }),
    );
  }
}

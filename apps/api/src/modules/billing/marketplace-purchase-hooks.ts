import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { ItemStanding } from './domain/invoice-state.js';
import type { MarketplaceInvoiceRecord } from './invoice.schema.js';

/**
 * What the marketplace module does for billing's `marketplace` invoices (ADR-036). Billing never
 * imports that module: it registers this once, at startup, as automations register their
 * `PlanChangeHooks`.
 */
export interface MarketplacePurchaseHandler {
  /**
   * In the transaction that marks the invoice paid: grants the workspace the item's licence at the
   * invoice's version. False when the workspace held it already, which then stays as it was. It
   * must stay within the database, since the transaction may run more than once.
   */
  grant(invoice: MarketplaceInvoiceRecord, at: Date, tx: Tx): Promise<boolean>;
  /**
   * Whether the licence the workspace holds is the one this invoice granted. False for an invoice
   * paid after the workspace came to hold the item another way: its money is refunded outside the
   * system, and no receipt tells the owner the item was bought.
   */
  grantedBy(invoice: MarketplaceInvoiceRecord): Promise<boolean>;
  /** What each item is to the workspace now: on sale, its price, held; every id gets an answer. */
  standings(
    ref: WorkspaceRef,
    itemIds: readonly string[],
    tx?: Tx,
  ): Promise<Map<string, ItemStanding>>;
  /** Whether the catalog has the item for a workspace to see: not a draft, not an unknown id. */
  hasItem(itemId: string): boolean;
}

/**
 * Where billing reaches the marketplace (ADR-036): the licence a paid marketplace invoice grants
 * (`InvoiceSettlement`), whether such an invoice is still payable, and the item board 31 the
 * gateway's card page leads back to.
 */
@Injectable()
export class MarketplacePurchaseHooks {
  private handler: MarketplacePurchaseHandler | null = null;

  register(handler: MarketplacePurchaseHandler): void {
    if (this.handler !== null) {
      throw new Error('A module registered marketplace purchases already');
    }
    this.handler = handler;
  }

  grant(invoice: MarketplaceInvoiceRecord, at: Date, tx: Tx): Promise<boolean> {
    return this.registered().grant(invoice, at, tx);
  }

  grantedBy(invoice: MarketplaceInvoiceRecord): Promise<boolean> {
    return this.registered().grantedBy(invoice);
  }

  /** The standing of the items of `invoices` that are marketplace invoices; none asked for none. */
  async standingsOf(
    ref: WorkspaceRef,
    invoices: readonly { kind: string; item: { itemId: string } | null }[],
    tx?: Tx,
  ): Promise<Map<string, ItemStanding>> {
    const itemIds = [
      ...new Set(
        invoices.flatMap((invoice) =>
          invoice.kind === 'marketplace' && invoice.item !== null ? [invoice.item.itemId] : [],
        ),
      ),
    ];
    return itemIds.length === 0 ? new Map() : this.registered().standings(ref, itemIds, tx);
  }

  hasItem(itemId: string): boolean {
    return this.registered().hasItem(itemId);
  }

  private registered(): MarketplacePurchaseHandler {
    if (this.handler === null) {
      throw new Error('No module settles marketplace invoices (ADR-036)');
    }
    return this.handler;
  }
}

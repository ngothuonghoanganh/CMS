import { Injectable } from '@nestjs/common';
import type {
  MarketplaceLicence,
  MarketplacePurchaseRequest,
  MarketplacePurchaseResponse,
  MarketplaceQuote,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { toPaymentMethodView } from '../billing/billing-dto.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { MarketplaceInvoiceRecord } from '../billing/invoice.schema.js';
import { type ChargeAnswer, InvoiceCharges } from '../billing/invoice-charges.service.js';
import { InvoicesService } from '../billing/invoices.service.js';
import { paymentNotApplied, paymentsDisabled } from '../billing/payment-problems.js';
import { TEMPLATE_NOT_FOUND } from '../templates/template-catalog.js';
import { AccessService, requireWritable } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { purchaseOutcome, quoteOutcome } from './domain/purchase-rules.js';
import { MarketplaceLicences, toMarketplaceLicence } from './marketplace-licences.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';
import { itemChanged, itemFree, itemOwned } from './marketplace-problems.js';

/** A purchase answered: its invoice and licence, and whether the gateway is still deciding (202). */
export interface PurchaseOutcome {
  response: MarketplacePurchaseResponse;
  pending: boolean;
}

/**
 * "Mua mẫu" (ADR-036, MP3, board 31): the quote, then the purchase of a paid item with the saved
 * card through billing's gateway, invoices and hold (ADR-035). Only Chủ sở hữu buys
 * (`billing.manage`); a read-only workspace may not (402), though it still pays its plan. The
 * licence is granted with the paid invoice, in billing's transaction
 * (`MarketplacePurchaseSettlement`), whichever way it is paid.
 */
@Injectable()
export class MarketplacePurchases {
  constructor(
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly charges: InvoiceCharges,
    private readonly invoices: InvoicesService,
    private readonly licences: MarketplaceLicences,
    private readonly repository: MarketplaceLicencesRepository,
  ) {}

  /** What "Mua mẫu" would charge now, with which card; nothing is charged. */
  async quote(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
  ): Promise<MarketplaceQuote> {
    const scope = await this.ownerScope(user, workspaceId);
    const held = await this.repository.find(scope, itemId);
    const outcome = quoteOutcome(this.licences.catalog, itemId, held);
    switch (outcome.kind) {
      case 'not_found':
        throw notFound(TEMPLATE_NOT_FOUND);
      case 'free':
        throw itemFree(outcome.item.name);
      case 'quote': {
        const { facts, at } = await this.entitlements.of(scope);
        const card = toPaymentMethodView(facts.paymentMethod, at);
        return {
          itemId: outcome.item.id,
          name: outcome.item.name,
          version: outcome.version,
          amount: outcome.item.price,
          termsVersion: this.licences.catalog.terms.version,
          owned: outcome.licence !== null,
          paymentMethod: card,
          paymentMethodRequired: card === null || card.expired,
          paymentsEnabled: this.charges.enabled,
          billingCompanyName: facts.billingInfo?.companyName ?? null,
        };
      }
    }
  }

  /**
   * Buys the item as the quote showed it, checked in ADR-036's order: membership (404), the
   * permission (403), read-only (402); then a key that made a purchase before answers with its
   * invoice, whatever became of the item; then the item on sale (404), not held (409
   * `item_owned`), with a price (409 `item_free`), the gateway on (503), the quote unchanged (409
   * `item_changed`), a card that can pay (422). Billing then holds the workspace's one charge at a
   * time, checks the item is still not held under the hold, makes the invoice and charges it.
   */
  async purchase(
    user: AuthenticatedUser,
    workspaceId: string,
    request: MarketplacePurchaseRequest,
    requestKey: string,
  ): Promise<PurchaseOutcome> {
    const scope = await this.ownerScope(user, workspaceId);
    requireWritable(scope);
    const earlier = await this.charges.purchaseOfKey(scope, requestKey);
    if (earlier !== null) {
      return this.answer(scope, await this.charges.replayPurchase(scope, earlier, request.itemId));
    }
    const held = await this.repository.find(scope, request.itemId);
    const outcome = purchaseOutcome(this.licences.catalog, request, held, this.charges.enabled);
    switch (outcome.kind) {
      case 'not_found':
        throw notFound(TEMPLATE_NOT_FOUND);
      case 'owned':
        throw itemOwned(outcome.item.name, toMarketplaceLicence(outcome.licence));
      case 'free':
        throw itemFree(outcome.item.name);
      case 'disabled':
        throw paymentsDisabled();
      case 'changed':
        throw itemChanged(outcome.item.name, outcome.current);
      case 'buy':
        break;
    }
    const { item } = outcome;
    const { facts, at } = await this.entitlements.of(scope);
    this.charges.requireMethod(facts, at);
    const answer = await this.charges.purchaseItem(scope, {
      item: {
        itemId: item.id,
        name: item.name,
        version: outcome.version,
        termsVersion: outcome.termsVersion,
      },
      amount: item.price,
      requestKey,
      confirm: async (tx) => {
        const licence = await this.repository.find(scope, item.id, tx);
        if (licence !== null) {
          throw itemOwned(item.name, toMarketplaceLicence(licence));
        }
      },
    });
    return this.answer(scope, answer);
  }

  /**
   * The invoice with the licence it granted (200), or none while the gateway decides (202). A paid
   * invoice whose licence is another (the workspace came to hold the item another way while it
   * was paid) is 409 `payment_not_applied`, also when the purchase is sent again.
   */
  private async answer(scope: WorkspaceScope, answer: ChargeAnswer): Promise<PurchaseOutcome> {
    const { invoice } = answer;
    if (invoice.kind !== 'marketplace') {
      throw new Error(`A purchase answered with invoice ${invoice._id.toHexString()} of the plan`);
    }
    const licence = answer.pending ? null : await this.licenceOf(scope, invoice);
    return {
      response: { invoice: await this.invoices.invoiceNow(scope, invoice), licence },
      pending: answer.pending,
    };
  }

  private async licenceOf(
    scope: WorkspaceScope,
    invoice: MarketplaceInvoiceRecord,
  ): Promise<MarketplaceLicence> {
    const licence = await this.repository.find(scope, invoice.item.itemId);
    if (licence === null) {
      throw new Error(`Invoice ${invoice._id.toHexString()} was paid without its licence`);
    }
    if (licence.invoiceId?.equals(invoice._id) !== true) {
      throw paymentNotApplied(invoice);
    }
    return toMarketplaceLicence(licence);
  }

  /** Membership (404), then `billing.manage` (403): only Chủ sở hữu buys. */
  private async ownerScope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    return scope;
  }
}

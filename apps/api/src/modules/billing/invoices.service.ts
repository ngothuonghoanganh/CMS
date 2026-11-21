import { Injectable } from '@nestjs/common';
import type {
  CursorQuery,
  Invoice,
  InvoiceListResponse,
  InvoiceReceipt,
  SubscriptionFacts,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { toInvoice, toInvoiceSummary } from './billing-dto.js';
import { type ItemStanding, payableOf } from './domain/invoice-state.js';
import { EntitlementsService } from './entitlements.service.js';
import { InvoiceCharges } from './invoice-charges.service.js';
import { InvoiceTransfers } from './invoice-transfers.service.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { InvoicesRepository } from './invoices.repository.js';
import { MarketplacePurchaseHooks } from './marketplace-purchase-hooks.js';

const INVOICE_NOT_FOUND = 'Không tìm thấy hóa đơn';

/** "Thanh toán lại" answered: the invoice, and whether the gateway is still deciding (202). */
export interface PayInvoiceOutcome {
  invoice: Invoice;
  pending: boolean;
}

/**
 * Board 29's "Lịch sử giao dịch", its receipts and "Thanh toán lại" (ADR-035), for the owner only
 * (`billing.manage`), also in a read-only workspace. Another workspace's invoice is not found.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly invoices: InvoicesRepository,
    private readonly charges: InvoiceCharges,
    private readonly transfers: InvoiceTransfers,
    private readonly purchases: MarketplacePurchaseHooks,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async list(
    user: AuthenticatedUser,
    workspaceId: string,
    query: CursorQuery,
  ): Promise<InvoiceListResponse> {
    const scope = await this.ownerScope(user, workspaceId);
    const [page, { facts, at }] = await Promise.all([
      this.invoices.list(scope, { cursor: query.cursor, limit: query.limit }),
      this.entitlements.of(scope),
    ]);
    // One read for the items of every marketplace invoice of the page (ADR-036).
    const standings = await this.purchases.standingsOf(scope, page.items);
    return {
      items: page.items.map((invoice) =>
        toInvoiceSummary(invoice, payableOf(invoice, facts, at, standingOf(invoice, standings))),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async get(user: AuthenticatedUser, workspaceId: string, invoiceId: string): Promise<Invoice> {
    const scope = await this.ownerScope(user, workspaceId);
    const [invoice, { facts, at }] = await Promise.all([
      this.find(scope, invoiceId),
      this.entitlements.of(scope),
    ]);
    return this.invoiceOf(scope, invoice, facts, at);
  }

  /** "Tải hóa đơn": only a paid invoice has a receipt. */
  async receipt(
    user: AuthenticatedUser,
    workspaceId: string,
    invoiceId: string,
  ): Promise<InvoiceReceipt> {
    const scope = await this.ownerScope(user, workspaceId);
    const [invoice, workspace] = await Promise.all([
      this.find(scope, invoiceId),
      this.workspaces.findWorkspace(scope),
    ]);
    if (invoice.status !== 'paid') {
      throw notFound('Hóa đơn chưa được thanh toán nên chưa có biên nhận');
    }
    if (workspace === null) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} disappeared`);
    }
    return { invoice: toInvoice(invoice, false), workspaceName: workspace.name };
  }

  /** "Thanh toán lại" with the saved card; the same `Idempotency-Key` never charges twice. */
  async pay(
    user: AuthenticatedUser,
    workspaceId: string,
    invoiceId: string,
    requestKey: string,
  ): Promise<PayInvoiceOutcome> {
    const scope = await this.ownerScope(user, workspaceId);
    const answer = await this.charges.payAgain(
      scope,
      toObjectId(invoiceId, INVOICE_NOT_FOUND),
      requestKey,
    );
    return { invoice: await this.invoiceNow(scope, answer.invoice), pending: answer.pending };
  }

  /** "Chuyển khoản" (T3): the invoice waiting for a transfer, with its details. */
  async startTransfer(
    user: AuthenticatedUser,
    workspaceId: string,
    invoiceId: string,
  ): Promise<Invoice> {
    const scope = await this.ownerScope(user, workspaceId);
    const invoice = await this.transfers.start(scope, toObjectId(invoiceId, INVOICE_NOT_FOUND));
    return this.invoiceNow(scope, invoice);
  }

  /**
   * The contract's form of an invoice, payable or not now: what a charge or a purchase answers
   * with, the marketplace's included (ADR-036).
   */
  async invoiceNow(scope: WorkspaceScope, invoice: InvoiceRecord): Promise<Invoice> {
    const { facts, at } = await this.entitlements.of(scope);
    return this.invoiceOf(scope, invoice, facts, at);
  }

  private async find(scope: WorkspaceScope, invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findOfWorkspace(
      scope,
      toObjectId(invoiceId, INVOICE_NOT_FOUND),
    );
    if (invoice === null) {
      throw notFound(INVOICE_NOT_FOUND);
    }
    return invoice;
  }

  private async invoiceOf(
    scope: WorkspaceScope,
    invoice: InvoiceRecord,
    facts: SubscriptionFacts,
    at: Date,
  ): Promise<Invoice> {
    const standings = await this.purchases.standingsOf(scope, [invoice]);
    return toInvoice(invoice, payableOf(invoice, facts, at, standingOf(invoice, standings)));
  }

  private async ownerScope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    return scope;
  }
}

/** The standing of a marketplace invoice's item; none for an invoice of the plan. */
function standingOf(
  invoice: InvoiceRecord,
  standings: ReadonlyMap<string, ItemStanding>,
): ItemStanding | undefined {
  return invoice.kind === 'marketplace' ? standings.get(invoice.item.itemId) : undefined;
}

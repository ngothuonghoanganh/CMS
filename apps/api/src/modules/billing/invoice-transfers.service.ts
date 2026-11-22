import { Injectable } from '@nestjs/common';
import { TRANSFER_RECEIVED, TRANSFER_RESULT_PARAM } from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
import { BillingClock } from './billing-clock.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { awaitsTransfer, invoiceTransferable } from './domain/invoice-state.js';
import { PaymentGateway } from './gateway/payment-gateway.js';
import type { InvoiceRecord, InvoiceTransferRecord } from './invoice.schema.js';
import { InvoicesRepository } from './invoices.repository.js';
import {
  invoiceNotPayable,
  paymentInProgress,
  paymentsDisabled,
  paymentUndecided,
  purchaseNotByTransfer,
} from './payment-problems.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** How long starting a transfer holds the subscription, as a charge does. */
const TRANSFER_HOLD_MS = 2 * 60_000;

/**
 * "Chuyển khoản" (ADR-035, T3): an unpaid invoice of a period (a renewal, the end of a trial, a
 * plan paid now) waits for a bank transfer instead of a card. The gateway gives the account, the
 * content naming the invoice and a QR payload; the invoice is `pending` and the subscription
 * waits for it (`openInvoiceId`, state `pending_payment` while nothing failed), with the grace.
 * The gateway's `transfer_received` pays it. Starting one holds the subscription like a charge,
 * so a card charge of the same invoice never runs at the same time.
 */
@Injectable()
export class InvoiceTransfers {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly clock: BillingClock,
    private readonly invoices: InvoicesRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly schedule: BillingSchedule,
    private readonly links: WorkspaceLinks,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Starts the transfer of an invoice; asked again, the same details. */
  async start(scope: WorkspaceScope, invoiceId: ObjectId): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findOfWorkspace(scope, invoiceId);
    if (invoice === null) {
      throw notFound('Không tìm thấy hóa đơn');
    }
    if (invoice.kind === 'marketplace') {
      throw purchaseNotByTransfer();
    }
    if (awaitsTransfer(invoice) && invoice.transfer !== null) {
      return invoice;
    }
    if (this.gateway.provider === 'none') {
      throw paymentsDisabled();
    }
    if (invoice.status === 'open') {
      // Its charge may have gone through: "Thanh toán lại" asks the gateway first.
      throw paymentUndecided(invoice);
    }
    const at = this.clock.now();
    const facts = await this.subscriptions.find(scope);
    if (facts === null || !this.transferable(invoice, facts, at)) {
      throw invoiceNotPayable();
    }
    const transfer = await this.instructionsFor(scope, invoice, at);
    const until = new Date(at.getTime() + TRANSFER_HOLD_MS);
    return this.transactions.run(async (tx) => {
      const hold = await this.subscriptions.holdForCharge(scope, { at, until }, tx);
      if (hold === 'busy' || (await this.invoices.hasPending(scope, tx))) {
        throw paymentInProgress();
      }
      const [fresh, current] = await Promise.all([
        this.invoices.findOfWorkspace(scope, invoiceId, tx),
        this.subscriptions.find(scope, tx),
      ]);
      if (fresh === null || current === null || !this.transferable(fresh, current, at)) {
        throw invoiceNotPayable();
      }
      const started = await this.invoices.startTransfer(invoiceId, transfer, tx);
      if (started === null) {
        throw invoiceNotPayable();
      }
      await this.recordStarted(scope, started, at, tx);
      await this.subscriptions.releaseCharge(scope, until, tx);
      return started;
    });
  }

  /**
   * Gives the details to an invoice made waiting for a transfer (a plan paid now by transfer, a
   * renewal by transfer of T4), once it has its number; again to one a refused card dropped them
   * from. Null when it has them already or no longer waits.
   */
  async fill(ref: WorkspaceRef, invoice: InvoiceRecord): Promise<InvoiceRecord | null> {
    const transfer = await this.instructionsFor(ref, invoice, this.clock.now());
    return this.transactions.run((tx) => this.invoices.startTransfer(invoice._id, transfer, tx));
  }

  /**
   * In the transaction that starts the transfer: the subscription waits for the invoice, the
   * `billing_log` says who started it, and the job's next time follows (no retry of the card).
   * The next period's invoice made before the end (T4) is not waited for before that end.
   */
  async recordStarted(
    scope: WorkspaceScope,
    invoice: InvoiceRecord,
    at: Date,
    tx: Tx,
  ): Promise<void> {
    const facts = await this.subscriptions.find(scope, tx);
    if (facts === null) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    const id = invoice._id.toHexString();
    if (facts.openInvoiceId !== id && facts.renewalInvoiceId !== id) {
      await this.subscriptions.waitFor(
        scope,
        { invoiceId: invoice._id, fromVersion: facts.version, at },
        tx,
      );
    }
    await this.log.record(
      scope,
      {
        at,
        actorId: scope.userId,
        action: 'transfer_started',
        invoiceId: invoice._id,
        amount: invoice.amount,
      },
      tx,
    );
    await this.schedule.reschedule(scope, at, tx);
  }

  /** A refused invoice of a period, or a transfer waiting without its details yet. */
  private transferable(
    invoice: InvoiceRecord,
    facts: Parameters<typeof invoiceTransferable>[1],
    at: Date,
  ): boolean {
    return (
      invoiceTransferable(invoice, facts, at) &&
      (invoice.status === 'failed' || invoice.transfer === null)
    );
  }

  /** What the gateway gives for the invoice's transfer; its page leads back to board 29. */
  private async instructionsFor(
    ref: WorkspaceRef,
    invoice: Pick<InvoiceRecord, '_id' | 'number' | 'amount'>,
    at: Date,
  ): Promise<InvoiceTransferRecord> {
    const workspaceId = ref.workspaceId.toHexString();
    const returnUrl = new URL(
      `/workspaces/${encodeURIComponent(workspaceId)}/billing/payments`,
      await this.links.originOf(ref.workspaceId),
    );
    returnUrl.searchParams.set(TRANSFER_RESULT_PARAM, TRANSFER_RECEIVED);
    const instructions = await this.gateway.startTransfer({
      reference: invoice._id.toHexString(),
      amount: invoice.amount,
      invoiceNumber: invoice.number,
      returnUrl: returnUrl.toString(),
    });
    if (instructions.amount !== invoice.amount) {
      throw new Error(
        `The gateway gave a transfer of another amount for invoice ${invoice._id.toHexString()}`,
      );
    }
    return {
      bankName: instructions.bankName,
      accountNumber: instructions.accountNumber,
      accountName: instructions.accountName,
      content: instructions.content,
      qrPayload: instructions.qrPayload,
      pageUrl: instructions.pageUrl,
      startedAt: at,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { PlanCatalog } from '@plp/contracts';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { BillingNotifier } from './billing-notifier.service.js';
import { BillingSchedule, lacksTransferDetails } from './billing-schedule.service.js';
import { awaitsRenewalTransfer, chargeUndecided } from './domain/invoice-state.js';
import { currentEndOf, renewalTermsOf, transferInvoiceDue } from './domain/renewal.js';
import type { InvoiceReplacedRecord, PlanInvoiceRecord } from './invoice.schema.js';
import { InvoiceTransfers } from './invoice-transfers.service.js';
import { InvoicesRepository } from './invoices.repository.js';
import { subscriptionChanged } from './payment-problems.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** What making the next period's transfer invoice in a transaction did. */
export type IssueOutcome =
  | { kind: 'issued'; invoice: PlanInvoiceRecord }
  /** Nothing to make now: not renewed by transfer, made already, paid, or not its time. */
  | { kind: 'not_due' }
  /** A card charge of the workspace is being decided or unknown: made once it is known. */
  | { kind: 'blocked' };

/** What a plan change did to the early transfer invoice in its transaction. */
export type ReissueOutcome =
  | { kind: 'done'; voided: PlanInvoiceRecord | null; issued: PlanInvoiceRecord | null }
  /**
   * The owner's card charge of the early invoice is being decided or may have gone through:
   * nothing may void it, since the money may be taken (409 `payment_in_progress`).
   */
  | { kind: 'undecided'; invoice: PlanInvoiceRecord };

/** Who and when, for the `billing_log` of an early invoice made or voided. */
export interface RenewalChange {
  at: Date;
  /** The member whose change it follows; null for the billing job. */
  actorId: ObjectId | null;
}

/**
 * The next period's invoice of a plan renewed by bank transfer (ADR-035, T4), made before the
 * trial or period ends (`renewalInvoiceId`): the billing job makes it `transferLeadDays` before,
 * a request makes it at once when that time passed (choosing the transfer, "Giữ lại gói"), and a
 * plan change before the end voids it and makes its replacement. It is made in the caller's
 * transaction with its number; the gateway's transfer details and the owner's email follow the
 * commit (`complete`), and the job completes what a failure left.
 */
@Injectable()
export class RenewalTransfers {
  private readonly logger = new Logger(RenewalTransfers.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly invoices: InvoicesRepository,
    private readonly transfers: InvoiceTransfers,
    private readonly notifier: BillingNotifier,
    private readonly log: BillingLogRepository,
    private readonly schedule: BillingSchedule,
  ) {}

  /**
   * Makes the next period's invoice in `tx` when it is due at `at` (`transferInvoiceDue`): the
   * plan and cycle the period will have (a scheduled change applied), `pending` for its transfer,
   * and the subscription keeps it as `renewalInvoiceId`. Not while a card charge of the workspace
   * may still go through: the job makes it once that is known. 409 `conflict` when the
   * subscription moved since `tx` read it.
   */
  async issueIn(
    ref: WorkspaceRef,
    change: RenewalChange & { replaces?: InvoiceReplacedRecord | null },
    tx: Tx,
  ): Promise<IssueOutcome> {
    const { at } = change;
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    if (!transferInvoiceDue(facts, this.catalog, at)) {
      return { kind: 'not_due' };
    }
    if (
      (await this.invoices.hasPending(ref, tx)) ||
      (await this.invoices.findUndecided(ref, tx)) !== null
    ) {
      return { kind: 'blocked' };
    }
    const terms = renewalTermsOf(facts, (planId) => planOf(this.catalog, planId));
    const invoice = await this.invoices.create(
      {
        workspaceId: ref.workspaceId,
        kind: 'subscription',
        planId: terms.plan.id,
        planName: terms.plan.name,
        cycle: terms.cycle,
        periodStart: terms.periodStart,
        periodEnd: terms.periodEnd,
        amount: terms.amount,
        billingInfo: facts.billingInfo,
        method: 'transfer',
        card: null,
        from: null,
        endsTrial: facts.trialEndsAt !== null,
        createdBy: change.actorId,
        item: null,
        requestKey: null,
        awaitingTransfer: true,
        transferRenewal: true,
        replaces: change.replaces ?? null,
      },
      at,
      tx,
    );
    if (invoice.kind === 'marketplace') {
      throw new Error('A renewal invoice is an invoice of the plan');
    }
    if (
      !(await this.subscriptions.setRenewalInvoice(
        ref,
        { invoiceId: invoice._id, fromVersion: facts.version, at },
        tx,
      ))
    ) {
      // Rolls the invoice back with the transaction.
      throw subscriptionChanged();
    }
    await this.log.record(
      ref,
      {
        at,
        actorId: change.actorId,
        action: 'transfer_started',
        invoiceId: invoice._id,
        amount: invoice.amount,
      },
      tx,
    );
    return { kind: 'issued', invoice };
  }

  /**
   * In the transaction of a change of what the next period is or costs (T4): a plan change, a
   * cancellation, keeping the plan. Before the end, the unpaid early invoice is voided (its
   * transfer details stop working) and, when the plan still renews then, its replacement is made at
   * once with the new amount, a new number and new content. The job's next time follows.
   */
  async reissueIn(ref: WorkspaceRef, change: RenewalChange, tx: Tx): Promise<ReissueOutcome> {
    const { at } = change;
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    let voided: PlanInvoiceRecord | null = null;
    if (facts.renewalInvoiceId !== null && at.getTime() < currentEndOf(facts).getTime()) {
      const invoice = await this.invoices.findByReference(toObjectId(facts.renewalInvoiceId), tx);
      if (invoice?.kind === 'marketplace') {
        throw new Error(`Renewal invoice ${facts.renewalInvoiceId} is a marketplace invoice`);
      }
      if (invoice !== null && chargeUndecided(invoice)) {
        return { kind: 'undecided', invoice };
      }
      voided = invoice === null ? null : await this.voidIn(ref, invoice._id, change, tx);
      if (
        !(await this.subscriptions.setRenewalInvoice(
          ref,
          { invoiceId: null, fromVersion: facts.version, at },
          tx,
        ))
      ) {
        throw subscriptionChanged();
      }
    }
    const issued = await this.issueIn(
      ref,
      {
        ...change,
        replaces: voided === null ? null : { invoiceId: voided._id, number: voided.number },
      },
      tx,
    );
    await this.schedule.reschedule(ref, at, tx);
    return { kind: 'done', voided, issued: issued.kind === 'issued' ? issued.invoice : null };
  }

  /**
   * Voids an unpaid early invoice in `tx`, with its `billing_log` entry; null when it was paid or
   * decided meanwhile. The subscription's `renewalInvoiceId` is the caller's to clear.
   */
  async voidIn(
    ref: WorkspaceRef,
    invoiceId: ObjectId,
    change: RenewalChange,
    tx: Tx,
  ): Promise<PlanInvoiceRecord | null> {
    const voided = await this.invoices.voidRenewalTransfer(invoiceId, change.at, tx);
    if (voided !== null) {
      await this.log.record(
        ref,
        {
          at: change.at,
          actorId: change.actorId,
          action: 'renewal_invoice_voided',
          invoiceId: voided._id,
          amount: voided.amount,
        },
        tx,
      );
    }
    return voided;
  }

  /**
   * After the transaction that made an early invoice: the gateway's transfer details for it, then
   * `billing-transfer-due` (`issued`) to the owner. The same for the invoice an ended period waits
   * for, without the email (the job sends `due`). `refillRefused`: also gives details again to an
   * invoice a refused card dropped them from, only under the billing job's hold, since a card
   * charge of it may otherwise be running. Safe to run again; never throws: `failed` leaves it to
   * the job, whose timeline has it (`transfer_invoice`).
   */
  async complete(
    ref: WorkspaceRef,
    options: { refillRefused?: boolean } = {},
  ): Promise<'done' | 'none' | 'failed'> {
    try {
      const facts = await this.subscriptions.find(ref);
      const id = facts?.renewalInvoiceId ?? facts?.openInvoiceId ?? null;
      if (facts?.renewalMethod !== 'transfer' || id === null) {
        return 'none';
      }
      let invoice = await this.invoices.findByReference(toObjectId(id));
      if (invoice === null || invoice.kind === 'marketplace' || invoice.transferRenewal !== true) {
        return 'none';
      }
      if (
        lacksTransferDetails(invoice) &&
        (invoice.status !== 'failed' || options.refillRefused === true)
      ) {
        invoice = (await this.transfers.fill(ref, invoice)) ?? invoice;
      }
      if (
        invoice.kind !== 'marketplace' &&
        facts.renewalInvoiceId === id &&
        awaitsRenewalTransfer(invoice) &&
        invoice.transfer !== null
      ) {
        return (await this.notifier.transferDue(invoice, 'issued')) === 'failed'
          ? 'failed'
          : 'done';
      }
      return 'done';
    } catch (error) {
      this.logger.warn(
        { workspaceId: ref.workspaceId.toHexString(), err: error },
        'Completing the transfer invoice of a renewal failed; the billing job tries again',
      );
      return 'failed';
    }
  }
}

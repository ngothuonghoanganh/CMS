import { Injectable, Logger } from '@nestjs/common';
import type { ChargeOutcome, InvoiceStatus, PaymentDeclineCode, PlanCatalog } from '@plp/contracts';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { periodPaidAt, purposeOf, statusAfterCharge } from './domain/invoice-state.js';
import type {
  InvoiceRecord,
  MarketplaceInvoiceRecord,
  PlanInvoiceRecord,
} from './invoice.schema.js';
import { type InvoiceChange, InvoicesRepository } from './invoices.repository.js';
import { MarketplacePurchaseHooks } from './marketplace-purchase-hooks.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { RenewalTransfers } from './renewal-transfers.service.js';
import { type PaidPeriod, SubscriptionsRepository } from './subscriptions.repository.js';

/** The `billing_log` entry of each kind of payment. */
const PAID_ACTIONS = {
  start_paid: 'paid_plan_started',
  trial_end: 'paid_plan_started',
  upgrade: 'plan_upgraded',
  renewal: 'period_renewed',
  restart: 'plan_restarted',
} as const;

/** One charge's outcome, as a charge or the gateway's event reports it. */
export interface ChargeReport {
  number: number;
  at: Date;
  outcome: ChargeOutcome;
  code: PaymentDeclineCode | null;
  /** The `Idempotency-Key` of the "Thanh toán lại" request; null otherwise. */
  requestKey: string | null;
  /** A bank transfer that arrived, not a card charge (T3). */
  transfer?: boolean;
  /** The card charged, when the API charged it. */
  card?: { brand: string; last4: string };
}

/** A charge's outcome once recorded: the invoice after, and whether this report changed it. */
export interface RecordedCharge {
  invoice: InvoiceRecord;
  /**
   * False when the invoice was decided before (its status was not one of `from`): the report
   * changed nothing, and `invoice` is as something else left it.
   */
  recorded: boolean;
  /**
   * Whether what this report paid for was applied: false when the payment is recorded but no
   * longer applies (refunded outside the system); null when it paid nothing.
   */
  applied: boolean | null;
}

/**
 * Records what became of an invoice's charges (ADR-035), inside the caller's transaction, for the
 * charges the API makes and the gateway's events alike. A paid invoice applies what it pays for in
 * the same transaction: the first paid period that ends the trial, the upgrade, the next period of
 * a renewal, or a canceled plan started again, with its `billing_log` entry and `PlanChangeHooks`;
 * or the licence of a marketplace item (ADR-036, `MarketplacePurchaseHooks`), which never changes
 * the plan. The period paid for starts when it is paid when it would have ended by then
 * (`periodPaidAt`). A refused charge of the invoice the subscription waits for starts its grace
 * and retries (T3); a marketplace item's never does. The next period's transfer invoice paid
 * before the current period ends holds that period as paid until then (T4, `prepaid`); a paid
 * upgrade voids and replaces an unpaid one, a plan paid now voids it. The billing job's next time
 * follows. Nothing here leaves the database, so a transaction that runs again does it again safely.
 */
@Injectable()
export class InvoiceSettlement {
  private readonly logger = new Logger(InvoiceSettlement.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly invoices: InvoicesRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly hooks: PlanChangeHooks,
    private readonly purchases: MarketplacePurchaseHooks,
    private readonly schedule: BillingSchedule,
    private readonly renewals: RenewalTransfers,
  ) {}

  /**
   * Adds the charge to `invoice` while its status is one of `from`, and applies it when it paid.
   * The invoice after; unchanged, and not `recorded`, when its status was not one of `from`
   * (decided before).
   */
  async record(
    invoice: InvoiceRecord,
    report: ChargeReport,
    from: readonly InvoiceStatus[],
    tx: Tx,
  ): Promise<RecordedCharge> {
    const status = statusAfterCharge(report.outcome);
    // Written with `paid`: until this write the invoice is unpaid, so its period may still move.
    const period =
      status === 'paid' && invoice.kind !== 'marketplace' ? periodPaidAt(invoice, report.at) : null;
    const change: InvoiceChange = {
      status,
      ...(report.card ? { card: report.card } : {}),
      ...(status === 'paid' ? { paidAt: report.at } : {}),
      ...(period === null ? {} : { period }),
    };
    const after = await this.invoices.recordCharge(
      invoice._id,
      from,
      {
        number: report.number,
        at: report.at,
        outcome: report.outcome,
        code: report.code,
        requestKey: report.requestKey,
        ...(report.transfer === true ? { transfer: true } : {}),
      },
      change,
      tx,
    );
    if (after === null) {
      const current = await this.invoices.findByReference(invoice._id, tx);
      return { invoice: current ?? invoice, recorded: false, applied: null };
    }
    const ref = { workspaceId: after.workspaceId };
    let applied: boolean | null = null;
    if (after.kind === 'marketplace') {
      if (after.status === 'paid') {
        applied = await this.applyPurchase(after, report.at, tx);
      }
    } else if (after.status === 'paid' && invoice.kind !== 'marketplace') {
      // A renewal follows the period that ended where the invoice's own period was to start.
      applied = await this.applyPaid(after, { at: report.at, follows: invoice.periodStart }, tx);
    } else if (after.status === 'failed') {
      await this.subscriptions.recordFailure(ref, { invoiceId: after._id, at: report.at }, tx);
    }
    await this.schedule.reschedule(ref, report.at, tx);
    return { invoice: after, recorded: true, applied };
  }

  /** The invoice of `invoiceId` in `tx`, for an event that names it. */
  find(invoiceId: ObjectId, tx: Tx): Promise<InvoiceRecord | null> {
    return this.invoices.findByReference(invoiceId, tx);
  }

  /**
   * What a paid invoice pays for, with the period it was paid for. When it no longer applies (the
   * trial was paid, or the plan moved on, while the payment was decided), the payment stays
   * recorded and is reported for a refund outside the system (ADR-035): it is never applied over a
   * newer choice. `follows`: where the period was to start when the invoice was made.
   */
  private async applyPaid(
    invoice: PlanInvoiceRecord,
    { at, follows }: { at: Date; follows: Date },
    tx: Tx,
  ): Promise<boolean> {
    const ref = { workspaceId: invoice.workspaceId };
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      this.reportUnapplied(invoice, 'the workspace has no subscription');
      return false;
    }
    const from = planOf(this.catalog, facts.planId);
    const to = planOf(this.catalog, invoice.planId);
    const period: PaidPeriod = {
      planId: invoice.planId,
      cycle: invoice.cycle,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      fromVersion: facts.version,
      at,
    };
    const purpose = purposeOf(invoice);
    if (purpose === 'marketplace') {
      throw new Error(`Invoice ${invoice._id.toHexString()} of the plan has a marketplace purpose`);
    }
    if ((purpose === 'renewal' || purpose === 'trial_end') && at.getTime() < follows.getTime()) {
      return this.prepay(invoice, facts.version, at, tx);
    }
    let applied: boolean;
    switch (purpose) {
      case 'start_paid':
      case 'trial_end':
        applied = await this.subscriptions.startPaidPeriod(ref, period, tx);
        break;
      case 'renewal':
        applied = await this.subscriptions.renewPeriod(ref, { ...period, follows }, tx);
        break;
      case 'restart':
        applied = await this.subscriptions.restartPeriod(ref, period, tx);
        break;
      case 'upgrade':
        applied =
          invoice.from !== null &&
          (await this.subscriptions.upgradePlan(
            ref,
            {
              from: invoice.from,
              periodEnd: invoice.periodEnd,
              planId: invoice.planId,
              fromVersion: facts.version,
              at,
            },
            tx,
          ));
        break;
    }
    if (!applied) {
      this.reportUnapplied(invoice, 'the subscription moved on before it was paid');
      return false;
    }
    const renewal = { at, actorId: invoice.createdBy };
    if (purpose === 'upgrade') {
      // The next period costs more now: its unpaid transfer invoice is replaced (T4).
      const reissued = await this.renewals.reissueIn(ref, renewal, tx);
      if (reissued.kind === 'undecided') {
        this.logger.error(
          {
            workspaceId: ref.workspaceId.toHexString(),
            invoiceId: reissued.invoice._id.toHexString(),
            number: reissued.invoice.number,
          },
          'An upgrade was paid while a card charge of the next period’s transfer invoice was undecided: that invoice keeps the old amount',
        );
      }
    } else if (
      (purpose === 'start_paid' || purpose === 'restart') &&
      facts.renewalInvoiceId !== null &&
      facts.renewalInvoiceId !== invoice._id.toHexString()
    ) {
      // The trial it ended had its transfer invoice made before its end (T4): nothing to pay now.
      await this.renewals.voidIn(ref, toObjectId(facts.renewalInvoiceId), renewal, tx);
    }
    const before = { planId: facts.planId, cycle: facts.cycle };
    const after = { planId: invoice.planId, cycle: invoice.cycle };
    const paid = { invoiceId: invoice._id, amount: invoice.amount };
    await this.log.record(
      ref,
      {
        at,
        actorId: invoice.createdBy,
        action: PAID_ACTIONS[purpose],
        from: before,
        to: after,
        ...paid,
      },
      tx,
    );
    if (purpose === 'renewal' && (before.planId !== after.planId || before.cycle !== after.cycle)) {
      // The change the owner scheduled for this period's end, applied by its payment.
      await this.log.record(
        ref,
        { at, actorId: null, action: 'scheduled_change_applied', from: before, to: after, ...paid },
        tx,
      );
    }
    if (from.id !== to.id) {
      await this.hooks.run(ref, { from, to, at, by: invoice.createdBy }, tx);
    }
    return true;
  }

  /**
   * The next period's transfer invoice paid before the trial or period it follows ended (T4): no
   * day is lost, so the period stays as invoiced and is held as paid (`prepaid`); the billing job
   * starts it at that end, with the scheduled change applied then. When the subscription no longer
   * waits for this invoice, the payment stays recorded and is refunded outside the system.
   */
  private async prepay(
    invoice: PlanInvoiceRecord,
    fromVersion: number,
    at: Date,
    tx: Tx,
  ): Promise<boolean> {
    const ref = { workspaceId: invoice.workspaceId };
    const prepaid = await this.subscriptions.prepay(
      ref,
      {
        prepaid: {
          invoiceId: invoice._id.toHexString(),
          planId: invoice.planId,
          cycle: invoice.cycle,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
        },
        fromVersion,
        at,
      },
      tx,
    );
    if (!prepaid) {
      this.reportUnapplied(invoice, 'the subscription no longer waits for it');
      return false;
    }
    const facts = await this.subscriptions.find(ref, tx);
    await this.log.record(
      ref,
      {
        at,
        actorId: invoice.createdBy,
        action: 'renewal_prepaid',
        from: facts === null ? null : { planId: facts.planId, cycle: facts.cycle },
        to: { planId: invoice.planId, cycle: invoice.cycle },
        invoiceId: invoice._id,
        amount: invoice.amount,
      },
      tx,
    );
    return true;
  }

  /**
   * A paid marketplace invoice grants the item's licence at its version, with its `billing_log`
   * entry (ADR-036), whatever became of the item since: an item withdrawn meanwhile is still
   * granted, since it was paid for. A workspace that came to hold the item another way meanwhile
   * (claimed once it became free) keeps that licence: the payment stays recorded and is reported
   * for a refund outside the system.
   */
  private async applyPurchase(
    invoice: MarketplaceInvoiceRecord,
    at: Date,
    tx: Tx,
  ): Promise<boolean> {
    if (!(await this.purchases.grant(invoice, at, tx))) {
      this.reportUnapplied(invoice, 'the workspace held the item’s licence already');
      return false;
    }
    await this.log.record(
      { workspaceId: invoice.workspaceId },
      {
        at,
        actorId: invoice.createdBy,
        action: 'marketplace_purchased',
        invoiceId: invoice._id,
        itemId: invoice.item.itemId,
        amount: invoice.amount,
      },
      tx,
    );
    return true;
  }

  private reportUnapplied(invoice: InvoiceRecord, why: string): void {
    this.logger.error(
      {
        workspaceId: invoice.workspaceId.toHexString(),
        invoiceId: invoice._id.toHexString(),
        number: invoice.number,
      },
      `A paid invoice was not applied because ${why}: refund it outside the system`,
    );
  }
}

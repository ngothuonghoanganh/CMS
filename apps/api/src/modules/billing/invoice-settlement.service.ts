import { Injectable, Logger } from '@nestjs/common';
import type { ChargeOutcome, InvoiceStatus, PaymentDeclineCode, PlanCatalog } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { periodPaidAt, purposeOf, statusAfterCharge } from './domain/invoice-state.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { type InvoiceChange, InvoicesRepository } from './invoices.repository.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
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
}

/**
 * Records what became of an invoice's charges (ADR-035), inside the caller's transaction, for the
 * charges the API makes and the gateway's events alike. A paid invoice applies what it pays for in
 * the same transaction: the first paid period that ends the trial, the upgrade, the next period of
 * a renewal, or a canceled plan started again, with its `billing_log` entry and `PlanChangeHooks`.
 * The period paid for starts when it is paid when it would have ended by then (`periodPaidAt`).
 * A refused charge of the invoice the subscription waits for starts its grace and retries (T3).
 * The billing job's next time follows. Nothing here leaves the database, so a transaction that
 * runs again does it again safely.
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
    private readonly schedule: BillingSchedule,
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
    const period = status === 'paid' ? periodPaidAt(invoice, report.at) : null;
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
      return { invoice: current ?? invoice, recorded: false };
    }
    const ref = { workspaceId: after.workspaceId };
    if (after.status === 'paid') {
      // A renewal follows the period that ended where the invoice's own period was to start.
      await this.applyPaid(after, { at: report.at, follows: invoice.periodStart }, tx);
    } else if (after.status === 'failed') {
      await this.subscriptions.recordFailure(ref, { invoiceId: after._id, at: report.at }, tx);
    }
    await this.schedule.reschedule(ref, report.at, tx);
    return { invoice: after, recorded: true };
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
    invoice: InvoiceRecord,
    { at, follows }: { at: Date; follows: Date },
    tx: Tx,
  ): Promise<void> {
    const ref = { workspaceId: invoice.workspaceId };
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      this.reportUnapplied(invoice, 'the workspace has no subscription');
      return;
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
      return;
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

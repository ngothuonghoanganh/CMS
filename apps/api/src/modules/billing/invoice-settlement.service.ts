import { Injectable, Logger } from '@nestjs/common';
import type { ChargeOutcome, InvoiceStatus, PaymentDeclineCode, PlanCatalog } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { periodEndOf } from './domain/billing-period.js';
import { statusAfterCharge } from './domain/invoice-state.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { type InvoiceChange, InvoicesRepository } from './invoices.repository.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** One charge's outcome, as a charge or the gateway's event reports it. */
export interface ChargeReport {
  number: number;
  at: Date;
  outcome: ChargeOutcome;
  code: PaymentDeclineCode | null;
  /** The `Idempotency-Key` of the "Thanh toán lại" request; null otherwise. */
  requestKey: string | null;
  /** The card charged, when the API charged it. */
  card?: { brand: string; last4: string };
}

/**
 * Records what became of an invoice's charges (ADR-035), inside the caller's transaction, for the
 * charges the API makes and the gateway's events alike. A paid invoice applies what it pays for in
 * the same transaction: the first paid period that ends the trial, or the upgrade, with its
 * `billing_log` entry and `PlanChangeHooks`. Nothing here leaves the database, so a transaction
 * that runs again does it again safely.
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
  ) {}

  /**
   * Adds the charge to `invoice` while its status is one of `from`, and applies it when it paid.
   * The invoice after; unchanged when its status was not one of `from` (decided before).
   */
  async record(
    invoice: InvoiceRecord,
    report: ChargeReport,
    from: readonly InvoiceStatus[],
    tx: Tx,
  ): Promise<InvoiceRecord> {
    const status = statusAfterCharge(report.outcome);
    const change: InvoiceChange = {
      status,
      ...(report.card ? { card: report.card } : {}),
      ...(status === 'paid' ? { paidAt: report.at } : {}),
      // The first paid period starts when it is paid, however late after the quote.
      ...(status === 'paid' && invoice.endsTrial
        ? { period: { start: report.at, end: periodEndOf(report.at, invoice.cycle) } }
        : {}),
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
      },
      change,
      tx,
    );
    if (after === null) {
      return (await this.invoices.findByReference(invoice._id, tx)) ?? invoice;
    }
    if (after.status === 'paid') {
      await this.applyPaid(after, report.at, tx);
    }
    return after;
  }

  /** The invoice of `invoiceId` in `tx`, for an event that names it. */
  find(invoiceId: ObjectId, tx: Tx): Promise<InvoiceRecord | null> {
    return this.invoices.findByReference(invoiceId, tx);
  }

  /**
   * What a paid invoice pays for. When it no longer applies (the trial was paid, or the plan moved
   * on, while the payment was decided), the payment stays recorded and is reported for a refund
   * outside the system (ADR-035): it is never applied over a newer choice.
   */
  private async applyPaid(invoice: InvoiceRecord, at: Date, tx: Tx): Promise<void> {
    const ref = { workspaceId: invoice.workspaceId };
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      this.reportUnapplied(invoice, 'the workspace has no subscription');
      return;
    }
    const from = planOf(this.catalog, facts.planId);
    const to = planOf(this.catalog, invoice.planId);
    let applied: boolean;
    if (invoice.endsTrial) {
      applied = await this.subscriptions.startPaidPeriod(
        ref,
        {
          planId: invoice.planId,
          cycle: invoice.cycle,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          fromVersion: facts.version,
          at,
        },
        tx,
      );
    } else if (invoice.kind === 'upgrade' && invoice.from !== null) {
      applied = await this.subscriptions.upgradePlan(
        ref,
        {
          from: invoice.from,
          periodEnd: invoice.periodEnd,
          planId: invoice.planId,
          fromVersion: facts.version,
          at,
        },
        tx,
      );
    } else {
      throw new Error(
        `Invoice ${invoice._id.toHexString()} renews a period, which comes with T3 (ADR-035)`,
      );
    }
    if (!applied) {
      this.reportUnapplied(invoice, 'the subscription moved on before it was paid');
      return;
    }
    await this.log.record(
      ref,
      {
        at,
        actorId: invoice.createdBy,
        action: invoice.endsTrial ? 'paid_plan_started' : 'plan_upgraded',
        from: { planId: facts.planId, cycle: facts.cycle },
        to: { planId: invoice.planId, cycle: invoice.cycle },
        invoiceId: invoice._id,
        amount: invoice.amount,
      },
      tx,
    );
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

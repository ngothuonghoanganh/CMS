import { Injectable, Logger } from '@nestjs/common';
import {
  type BillingCycle,
  cardValidAt,
  type PaymentMethod,
  type Plan,
  type SubscriptionFacts,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingClock } from './billing-clock.js';
import {
  CHARGEABLE_INVOICE_STATUSES,
  chargeIdempotencyKey,
  invoicePayable,
  nextAttemptNumber,
} from './domain/invoice-state.js';
import type { PlanChange } from './domain/plan-change.js';
import { chargeWithTimeout } from './gateway/charge-with-timeout.js';
import { PaymentGateway, type ChargeResult } from './gateway/payment-gateway.js';
import type { InvoiceAttemptRecord, InvoiceRecord } from './invoice.schema.js';
import { InvoiceSettlement } from './invoice-settlement.service.js';
import { InvoicesRepository } from './invoices.repository.js';
import {
  gatewayUnavailable,
  invoiceNotPayable,
  paymentFailed,
  paymentInProgress,
  paymentMethodRequired,
  paymentNotApplied,
  paymentsDisabled,
  paymentUndecided,
  subscriptionChanged,
} from './payment-problems.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/**
 * How long one charge holds the subscription (`lockedUntil`): longer than any gateway answers.
 * An API that stops while waiting leaves the hold to run out; nothing else is held.
 */
export const CHARGE_HOLD_MS = 2 * 60_000;

/**
 * How long the API waits for the gateway to answer a charge: well within the hold, so a gateway
 * that hangs ends as an unknown outcome before another charge of the workspace may start.
 */
export const CHARGE_TIMEOUT_MS = 60_000;

/** What a charge became: `paid`, or `pending` while the gateway decides. */
export interface ChargeAnswer {
  invoice: InvoiceRecord;
  pending: boolean;
}

/** The card a charge uses: saved, and valid now. 422 otherwise. */
function chargeableMethod(
  facts: Pick<SubscriptionFacts, 'paymentMethod'>,
  at: Date,
): PaymentMethod {
  const method = facts.paymentMethod;
  if (method === null || !cardValidAt(method, at)) {
    throw paymentMethodRequired(method !== null);
  }
  return method;
}

/**
 * The answer of a recorded charge: paid or pending, or the problem of a refused or unknown one.
 * The same request asked again (`Idempotency-Key`) gets the same answer.
 */
function answerOf(
  invoice: InvoiceRecord,
  attempt: Pick<InvoiceAttemptRecord, 'outcome' | 'code'>,
  cause?: unknown,
): ChargeAnswer {
  switch (attempt.outcome) {
    case 'succeeded':
      return { invoice, pending: false };
    case 'pending':
      return { invoice, pending: true };
    case 'failed':
      throw paymentFailed(invoice, attempt.code ?? 'card_declined');
    case 'unknown':
      throw gatewayUnavailable(invoice, cause);
  }
}

/**
 * Charges invoices with the saved card (ADR-035): a plan change paid now, and "Thanh toán lại".
 * One charge per workspace at a time: it holds the subscription (`lockedUntil`) from before the
 * gateway is called until its outcome is recorded, and an invoice the gateway is still deciding
 * blocks the next. Each attempt's idempotency key is `{invoiceId}-{number}`, so asking again
 * never charges twice.
 */
@Injectable()
export class InvoiceCharges {
  private readonly logger = new Logger(InvoiceCharges.name);

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly clock: BillingClock,
    private readonly invoices: InvoicesRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly settlement: InvoiceSettlement,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Refuses with 503 while `PAYMENT_PROVIDER=none`. */
  requireEnabled(): void {
    if (this.gateway.provider === 'none') {
      throw paymentsDisabled();
    }
  }

  /** 422 unless a card that can pay at `at` is saved. */
  requireMethod(facts: Pick<SubscriptionFacts, 'paymentMethod'>, at: Date): void {
    chargeableMethod(facts, at);
  }

  /**
   * Makes the invoice of a plan change and charges it, from the subscription's `version` that was
   * read for the quote (409 `conflict` when it moved). It voids the refused invoices of earlier
   * changes, which this one replaces. An earlier charge whose outcome is unknown may have gone
   * through, so it blocks the change (409 `payment_in_progress` with its invoice) until "Thanh
   * toán lại" on that invoice decides it: voiding it and charging again could charge twice.
   */
  async checkout(
    scope: WorkspaceScope,
    input: {
      facts: SubscriptionFacts;
      current: Plan;
      target: Plan;
      cycle: BillingCycle;
      change: Extract<PlanChange, { mode: 'start_paid' | 'upgrade' }>;
      at: Date;
    },
  ): Promise<ChargeAnswer> {
    this.requireEnabled();
    const { facts, current, target, cycle, change, at } = input;
    const method = chargeableMethod(facts, at);
    const until = new Date(at.getTime() + CHARGE_HOLD_MS);
    const invoice = await this.transactions.run(async (tx) => {
      const hold = await this.subscriptions.holdForCharge(
        scope,
        { at, until, fromVersion: facts.version },
        tx,
      );
      if (hold !== 'held') {
        throw hold === 'busy' ? paymentInProgress() : subscriptionChanged();
      }
      if (await this.invoices.hasPending(scope, tx)) {
        throw paymentInProgress();
      }
      const undecided = await this.invoices.findUndecided(scope, tx);
      if (undecided !== null) {
        throw paymentUndecided(undecided);
      }
      await this.invoices.voidRefusedChanges(scope, at, tx);
      return this.invoices.create(
        {
          workspaceId: scope.workspaceId,
          kind: change.mode === 'upgrade' ? 'upgrade' : 'subscription',
          planId: target.id,
          planName: target.name,
          cycle,
          periodStart: change.periodStart,
          periodEnd: change.periodEnd,
          amount: change.amount,
          billingInfo: facts.billingInfo,
          method: 'card',
          card: null,
          from: { planId: current.id, cycle: facts.cycle },
          endsTrial: change.mode === 'start_paid',
          createdBy: scope.userId,
        },
        at,
        tx,
      );
    });
    return this.charge(scope, invoice, method, until, null);
  }

  /**
   * "Thanh toán lại": charges an unpaid invoice again with the saved card. A request whose
   * `Idempotency-Key` made an attempt before gets that attempt's answer again, without a charge;
   * the key is looked for again under the hold, where a request with the same key that was still
   * running at the first look has recorded its attempt.
   */
  async payAgain(
    scope: WorkspaceScope,
    invoiceId: ObjectId,
    requestKey: string,
  ): Promise<ChargeAnswer> {
    const invoice = await this.invoices.findOfWorkspace(scope, invoiceId);
    if (invoice === null) {
      throw notFound('Không tìm thấy hóa đơn');
    }
    const earlier = invoice.attempts.find((attempt) => attempt.requestKey === requestKey);
    if (earlier !== undefined) {
      return answerOf(invoice, earlier);
    }
    this.requireEnabled();
    const at = this.clock.now();
    const until = new Date(at.getTime() + CHARGE_HOLD_MS);
    const next = await this.transactions.run(async (tx) => {
      const hold = await this.subscriptions.holdForCharge(scope, { at, until }, tx);
      if (hold === 'busy') {
        throw paymentInProgress();
      }
      // Read under the hold: no other charge of the workspace can change them before this one.
      const [fresh, facts] = await Promise.all([
        this.invoices.findOfWorkspace(scope, invoiceId, tx),
        this.subscriptions.find(scope, tx),
      ]);
      if (fresh === null || facts === null) {
        throw new Error(`Invoice ${invoiceId.toHexString()} or its subscription disappeared`);
      }
      const replayed = fresh.attempts.find((attempt) => attempt.requestKey === requestKey);
      if (replayed !== undefined) {
        await this.subscriptions.releaseCharge(scope, until, tx);
        return { replay: { invoice: fresh, attempt: replayed } } as const;
      }
      if (await this.invoices.hasPending(scope, tx)) {
        throw paymentInProgress();
      }
      if (!invoicePayable(fresh, facts, at)) {
        throw invoiceNotPayable();
      }
      return { charge: { invoice: fresh, method: chargeableMethod(facts, at) } } as const;
    });
    if ('replay' in next) {
      return answerOf(next.replay.invoice, next.replay.attempt);
    }
    return this.charge(scope, next.charge.invoice, next.charge.method, until, requestKey);
  }

  /**
   * Calls the gateway, then records the outcome and lets the next charge start in one
   * transaction. A gateway that throws, or does not answer within `CHARGE_TIMEOUT_MS`, leaves the
   * outcome unknown: the invoice stays open and the next attempt reuses this one's idempotency key.
   */
  private async charge(
    scope: WorkspaceScope,
    invoice: InvoiceRecord,
    method: PaymentMethod,
    until: Date,
    requestKey: string | null,
  ): Promise<ChargeAnswer> {
    const number = nextAttemptNumber(invoice.attempts);
    const invoiceId = invoice._id.toHexString();
    const idempotencyKey = chargeIdempotencyKey(invoiceId, number);
    let result: ChargeResult | null = null;
    let failure: unknown = null;
    try {
      result = await chargeWithTimeout(
        this.gateway,
        { token: method.token, amount: invoice.amount, reference: invoiceId, idempotencyKey },
        CHARGE_TIMEOUT_MS,
        (late) => {
          // Recorded as unknown already: the next attempt asks again with this key.
          this.logger.warn(
            {
              workspaceId: scope.workspaceId.toHexString(),
              invoiceId,
              attempt: number,
              ...('result' in late ? { status: late.result.status } : { err: late.error }),
            },
            'The payment gateway answered a charge after its timeout',
          );
        },
      );
    } catch (error) {
      failure = error;
    }
    const report = {
      number,
      at: this.clock.now(),
      outcome: result?.status ?? 'unknown',
      code: result?.status === 'failed' ? result.code : null,
      requestKey,
      card: { brand: method.brand, last4: method.last4 },
    } as const;
    let after: InvoiceRecord;
    try {
      after = await this.transactions.run(async (tx) => {
        const recorded = await this.settlement.record(
          invoice,
          report,
          CHARGEABLE_INVOICE_STATUSES,
          tx,
        );
        await this.subscriptions.releaseCharge(scope, until, tx);
        return recorded;
      });
    } catch (error) {
      // Nothing of the outcome is stored, so the next attempt reuses this one's key: the gateway
      // answers it again and the invoice is settled then. The hold need not wait to run out.
      await this.subscriptions.releaseCharge(scope, until).catch((releaseError: unknown) => {
        throw new AggregateError(
          [error, releaseError],
          'Recording a charge failed, and so did releasing its hold',
        );
      });
      throw error;
    }
    this.logger.log(
      {
        workspaceId: scope.workspaceId.toHexString(),
        invoiceId,
        attempt: number,
        outcome: report.outcome,
        code: report.code,
        status: after.status,
      },
      'Charged an invoice',
    );
    // An event of the gateway may have decided the invoice first: its status is the answer.
    if (after.status === 'paid') {
      return { invoice: after, pending: false };
    }
    if (report.outcome === 'succeeded') {
      // The invoice was decided while the gateway answered (a hold that ran out): the money is
      // taken and nothing it pays for is applied.
      this.logger.error(
        {
          workspaceId: scope.workspaceId.toHexString(),
          invoiceId,
          number: after.number,
          status: after.status,
        },
        'A charge succeeded on an invoice decided before: refund it outside the system',
      );
      throw paymentNotApplied(after);
    }
    return answerOf(after, report, failure);
  }
}

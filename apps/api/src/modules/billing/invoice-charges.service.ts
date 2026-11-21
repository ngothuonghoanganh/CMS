import { Injectable, Logger } from '@nestjs/common';
import {
  type BillingCycle,
  cardValidAt,
  type PaymentDeclineCode,
  type PaymentMethod,
  type Plan,
  type SubscriptionFacts,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingClock } from './billing-clock.js';
import { BillingNotifier } from './billing-notifier.service.js';
import {
  awaitsTransfer,
  chargeableStatusesOf,
  chargeIdempotencyKey,
  invoicePayable,
  nextAttemptNumber,
} from './domain/invoice-state.js';
import type { PlanChange } from './domain/plan-change.js';
import { chargeWithTimeout } from './gateway/charge-with-timeout.js';
import { PaymentGateway, type ChargeResult } from './gateway/payment-gateway.js';
import type { InvoiceAttemptRecord, InvoiceRecord } from './invoice.schema.js';
import { InvoiceSettlement } from './invoice-settlement.service.js';
import { InvoiceTransfers } from './invoice-transfers.service.js';
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

/** One recorded charge: the invoice after it, and what the gateway said. */
export interface ChargeAttempt {
  invoice: InvoiceRecord;
  number: number;
  outcome: InvoiceAttemptRecord['outcome'];
  code: PaymentDeclineCode | null;
  /** Why the gateway could not be asked or did not answer; set for an unknown outcome. */
  failure: unknown;
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
 * Charges invoices with the saved card (ADR-035): a plan change paid now, "Thanh toán lại", and
 * the subscription's job (T3). One charge per workspace at a time: it holds the subscription
 * (`lockedUntil`) from before the gateway is called until its outcome is recorded, and an invoice
 * the gateway is still deciding blocks the next. Each attempt's idempotency key is
 * `{invoiceId}-{number}`, so asking again never charges twice. A paid invoice's receipt is
 * emailed once it is recorded.
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
    private readonly transfers: InvoiceTransfers,
    private readonly notifier: BillingNotifier,
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
   * changes, and the transfers still waiting for plans paid now, which this one replaces. An
   * earlier charge whose outcome is unknown may have gone through, so it blocks the change (409
   * `payment_in_progress` with its invoice) until "Thanh toán lại" on that invoice decides it:
   * voiding it and charging again could charge twice. So does a transfer waiting for the charge
   * at the end of the trial or period, which may arrive any time.
   *
   * Paid by transfer (`payWith: 'transfer'`, a plan paid now only, T3), nothing is charged: the
   * invoice waits for the gateway's confirmation (`pending`), and the subscription for it. The
   * gateway gives the transfer's details once the invoice has its number.
   */
  async checkout(
    scope: WorkspaceScope,
    input: {
      facts: SubscriptionFacts;
      current: Plan;
      target: Plan;
      cycle: BillingCycle;
      change: Extract<PlanChange, { mode: 'start_paid' | 'upgrade' }>;
      payWith: 'card' | 'transfer';
      at: Date;
    },
  ): Promise<ChargeAnswer> {
    this.requireEnabled();
    const { facts, current, target, cycle, change, at } = input;
    const byTransfer = input.payWith === 'transfer' && change.mode === 'start_paid';
    const method = byTransfer ? null : chargeableMethod(facts, at);
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
      await this.blockOnWaitingTransfer(scope, facts, tx);
      await this.invoices.voidRefusedChanges(scope, at, tx);
      const replaced = await this.invoices.voidReplacedTransfers(scope, at, tx);
      await this.subscriptions.stopWaitingFor(scope, replaced, tx);
      const created = await this.invoices.create(
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
          method: byTransfer ? 'transfer' : 'card',
          card: null,
          from: { planId: current.id, cycle: facts.cycle },
          endsTrial: change.mode === 'start_paid' && facts.trialEndsAt !== null,
          createdBy: scope.userId,
          awaitingTransfer: byTransfer,
        },
        at,
        tx,
      );
      if (byTransfer) {
        await this.transfers.recordStarted(scope, created, at, tx);
        await this.subscriptions.releaseCharge(scope, until, tx);
      }
      return created;
    });
    if (method === null) {
      return { invoice: (await this.transfers.fill(scope, invoice)) ?? invoice, pending: true };
    }
    return this.answer(await this.attempt(scope, invoice, method, until, null, false));
  }

  /**
   * "Thanh toán lại": charges an unpaid invoice again with the saved card, a transfer still
   * waiting included (T3). A request whose `Idempotency-Key` made an attempt before gets that
   * attempt's answer again, without a charge; the key is looked for again under the hold, where a
   * request with the same key that was still running at the first look has recorded its attempt.
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
    return this.answer(
      await this.attempt(scope, next.charge.invoice, next.charge.method, until, requestKey, false),
    );
  }

  /**
   * A charge of the subscription's job (T3), which holds the subscription until `until` and keeps
   * holding it after: the job lets go once its whole run is done.
   */
  chargeForJob(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    method: PaymentMethod,
    until: Date,
  ): Promise<ChargeAttempt> {
    return this.attempt(ref, invoice, method, until, null, true);
  }

  /**
   * A charge of the job that cannot reach the gateway (T3): no card saved, or it has expired. It is
   * recorded as refused with that reason, so the invoice and its retries say why.
   */
  async recordUncharged(
    invoice: InvoiceRecord,
    code: Extract<PaymentDeclineCode, 'no_payment_method' | 'expired_card'>,
  ): Promise<ChargeAttempt> {
    const number = nextAttemptNumber(invoice.attempts);
    const after = await this.transactions.run((tx) =>
      this.settlement.record(
        invoice,
        { number, at: this.clock.now(), outcome: 'failed', code, requestKey: null },
        chargeableStatusesOf(invoice),
        tx,
      ),
    );
    return { invoice: after, number, outcome: 'failed', code, failure: null };
  }

  /** Maps a recorded charge to the answer of a request, or its problem. */
  private answer(attempt: ChargeAttempt): ChargeAnswer {
    const { invoice } = attempt;
    // An event of the gateway may have decided the invoice first: its status is the answer.
    if (invoice.status === 'paid') {
      return { invoice, pending: false };
    }
    if (attempt.outcome === 'succeeded') {
      throw paymentNotApplied(invoice);
    }
    return answerOf(invoice, attempt, attempt.failure);
  }

  /** A transfer for the charge at the end of the trial or period may arrive any time. */
  private async blockOnWaitingTransfer(
    ref: WorkspaceRef,
    facts: Pick<SubscriptionFacts, 'openInvoiceId'>,
    tx: Tx,
  ): Promise<void> {
    if (facts.openInvoiceId === null) {
      return;
    }
    const due = await this.invoices.findOfWorkspace(ref, toObjectId(facts.openInvoiceId), tx);
    if (due !== null && due.from === null && awaitsTransfer(due)) {
      throw paymentUndecided(due);
    }
  }

  /**
   * Calls the gateway, then records the outcome in one transaction, which also lets the next charge
   * start unless the job keeps holding the subscription. A gateway that throws, or does not answer
   * within `CHARGE_TIMEOUT_MS`, leaves the outcome unknown: the invoice stays open and the next
   * attempt reuses this one's idempotency key.
   */
  private async attempt(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    method: PaymentMethod,
    until: Date,
    requestKey: string | null,
    keepHold: boolean,
  ): Promise<ChargeAttempt> {
    const number = nextAttemptNumber(invoice.attempts);
    const invoiceId = invoice._id.toHexString();
    const idempotencyKey = chargeIdempotencyKey(invoiceId, number);
    const workspaceId = ref.workspaceId.toHexString();
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
              workspaceId,
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
          chargeableStatusesOf(invoice),
          tx,
        );
        if (!keepHold) {
          await this.subscriptions.releaseCharge(ref, until, tx);
        }
        return recorded;
      });
    } catch (error) {
      // Nothing of the outcome is stored, so the next attempt reuses this one's key: the gateway
      // answers it again and the invoice is settled then. The hold need not wait to run out.
      if (!keepHold) {
        await this.subscriptions.releaseCharge(ref, until).catch((releaseError: unknown) => {
          throw new AggregateError(
            [error, releaseError],
            'Recording a charge failed, and so did releasing its hold',
          );
        });
      }
      throw error;
    }
    this.logger.log(
      {
        workspaceId,
        invoiceId,
        attempt: number,
        outcome: report.outcome,
        code: report.code,
        status: after.status,
      },
      'Charged an invoice',
    );
    if (after.status === 'paid' && invoice.status !== 'paid') {
      await this.notifier.receipt(after);
    } else if (report.outcome === 'succeeded') {
      // The invoice was decided while the gateway answered (a hold that ran out): the money is
      // taken and nothing it pays for is applied.
      this.logger.error(
        { workspaceId, invoiceId, number: after.number, status: after.status },
        'A charge succeeded on an invoice decided before: refund it outside the system',
      );
    }
    return { invoice: after, number, outcome: report.outcome, code: report.code, failure };
  }
}

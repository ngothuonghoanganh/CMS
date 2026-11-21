import { Injectable, Logger } from '@nestjs/common';
import type { GatewayEvent, PaymentProvider, PlanCatalog } from '@plp/contracts';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { BillingClock } from './billing-clock.js';
import { BillingEventsRepository, GatewayEventSeenError } from './billing-events.repository.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { BillingNotifier } from './billing-notifier.service.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { graceEndOf, nextRetryOf } from './domain/billing-agenda.js';
import { parseInvoiceReference, parseMethodSetupReference } from './domain/billing-references.js';
import { attemptOfIdempotencyKey } from './domain/invoice-state.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { InvoiceSettlement } from './invoice-settlement.service.js';
import { InjectPlanCatalog } from './plan-catalog.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** What became of an event: applied now, applied before, or ignored with why. */
export type WebhookOutcome =
  { result: 'applied' } | { result: 'duplicate' } | { result: 'ignored'; why: string };

/** An applied event, with the invoice it decided for the emails sent once it is stored. */
type Applied = WebhookOutcome & { decided?: InvoiceRecord };

/**
 * Applies the gateway's events (ADR-035). Each event is recorded in `billing_events` in the
 * transaction that applies it, so one that arrives again applies nothing. It is routed only by
 * the reference the API gave the gateway: the workspace of a card setup, the invoice of a charge.
 * An event naming nothing the API knows is recorded and ignored, and the answer is the same as
 * for any other, so it reveals nothing.
 */
@Injectable()
export class GatewayWebhookService {
  private readonly logger = new Logger(GatewayWebhookService.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly events: BillingEventsRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly settlement: InvoiceSettlement,
    private readonly schedule: BillingSchedule,
    private readonly notifier: BillingNotifier,
    private readonly clock: BillingClock,
    private readonly transactions: TransactionRunner,
  ) {}

  async receive(provider: PaymentProvider, event: GatewayEvent): Promise<WebhookOutcome> {
    let outcome: Applied;
    try {
      outcome = await this.transactions.run(async (tx) => {
        // Retention runs on real time, whatever the billing clock says.
        await this.events.record(
          { provider, eventId: event.eventId, kind: event.kind },
          new Date(),
          tx,
        );
        return this.apply(event, tx);
      });
    } catch (error) {
      if (error instanceof GatewayEventSeenError) {
        return { result: 'duplicate' };
      }
      throw error;
    }
    if (outcome.result === 'ignored') {
      this.logger.warn(
        { provider, eventId: event.eventId, kind: event.kind, why: outcome.why },
        'Ignored a payment gateway event',
      );
    }
    if (outcome.decided !== undefined) {
      await this.notify(outcome.decided);
    }
    return outcome.result === 'ignored'
      ? { result: 'ignored', why: outcome.why }
      : { result: outcome.result };
  }

  /**
   * The receipt of an invoice the event paid; the job's emails of a charge the gateway refused
   * later (T3): its retries and grace count from the first refusal. A marketplace item's refusal
   * never concerns the plan (ADR-036).
   */
  private async notify(invoice: InvoiceRecord): Promise<void> {
    if (invoice.status === 'paid') {
      await this.notifier.receipt(invoice);
      return;
    }
    if (invoice.kind === 'marketplace') {
      return;
    }
    const last = invoice.attempts.at(-1);
    const ref = { workspaceId: invoice.workspaceId };
    const facts = await this.subscriptions.find(ref);
    if (
      invoice.status !== 'failed' ||
      invoice.from !== null ||
      last?.code == null ||
      facts?.failedSince == null ||
      facts.openInvoiceId !== invoice._id.toHexString()
    ) {
      return;
    }
    await this.notifier.chargeFailed(invoice, {
      attempt: last.number,
      code: last.code,
      nextRetryAt: nextRetryOf(facts.failedSince, this.catalog.retryDays, invoice.attempts),
      graceEndsAt: graceEndOf(facts, this.catalog),
    });
  }

  private apply(event: GatewayEvent, tx: Tx): Promise<Applied> {
    switch (event.kind) {
      case 'method_saved':
        return this.methodSaved(event, tx);
      case 'charge_succeeded':
      case 'transfer_received':
        return this.paid(event, tx);
      case 'charge_failed':
        return this.failed(event, tx);
    }
  }

  /**
   * The card of a setup the owner started: it replaces the saved one. The first card of a trial
   * that ended without one is not charged for its end (T3): the trial stays expired.
   */
  private async methodSaved(
    event: Extract<GatewayEvent, { kind: 'method_saved' }>,
    tx: Tx,
  ): Promise<Applied> {
    const setup = parseMethodSetupReference(event.reference);
    if (setup === null) {
      return { result: 'ignored', why: 'the reference names no card setup' };
    }
    const ref = { workspaceId: setup.workspaceId };
    const at = this.clock.now();
    const facts = await this.subscriptions.find(ref, tx);
    if (facts === null) {
      return { result: 'ignored', why: 'no workspace has this reference' };
    }
    const afterTrial =
      facts.paymentMethod === null &&
      facts.trialEndsAt !== null &&
      at.getTime() >= facts.trialEndsAt.getTime();
    if (
      !(await this.subscriptions.setPaymentMethod(
        ref,
        { method: event.method, afterTrial, at },
        tx,
      ))
    ) {
      return { result: 'ignored', why: 'no workspace has this reference' };
    }
    await this.log.record(ref, { at, actorId: setup.userId, action: 'payment_method_changed' }, tx);
    // A card that expires before the period's end makes "Sắp hết hạn" due (T3).
    await this.schedule.reschedule(ref, at, tx);
    return { result: 'applied' };
  }

  /** A charge or transfer paid the invoice, unless something decided it for good before. */
  private async paid(
    event: Extract<GatewayEvent, { kind: 'charge_succeeded' | 'transfer_received' }>,
    tx: Tx,
  ): Promise<Applied> {
    const invoiceId = parseInvoiceReference(event.reference);
    const invoice = invoiceId === null ? null : await this.settlement.find(invoiceId, tx);
    if (invoice === null) {
      return { result: 'ignored', why: 'no invoice has this reference' };
    }
    if (event.amount !== invoice.amount) {
      // Money arrived and pays nothing: a transfer of another amount, or a gateway's mistake.
      this.logger.error(
        {
          workspaceId: invoice.workspaceId.toHexString(),
          invoiceId: invoice._id.toHexString(),
          kind: event.kind,
          amount: event.amount,
          invoiceAmount: invoice.amount,
        },
        'A payment of another amount than its invoice arrived and was not applied: refund it outside the system',
      );
      return { result: 'ignored', why: 'the amount is not the invoice’s' };
    }
    if (invoice.status === 'paid') {
      if (event.kind === 'transfer_received') {
        // Paid otherwise before this transfer arrived (a card, another transfer).
        this.logger.error(
          { workspaceId: invoice.workspaceId.toHexString(), invoiceId: invoice._id.toHexString() },
          'A transfer arrived for an invoice paid before: refund it outside the system',
        );
        return { result: 'ignored', why: 'the invoice was paid before' };
      }
      return { result: 'applied' };
    }
    if (invoice.status === 'void') {
      this.logger.error(
        { workspaceId: invoice.workspaceId.toHexString(), invoiceId: invoice._id.toHexString() },
        'A void invoice was paid: refund it outside the system',
      );
      return { result: 'ignored', why: 'the invoice is void' };
    }
    const key = event.kind === 'charge_succeeded' ? event.idempotencyKey : null;
    const number =
      (key === null ? null : attemptOfIdempotencyKey(invoice._id.toHexString(), key)) ??
      (invoice.attempts.at(-1)?.number ?? 0) + 1;
    const { invoice: decided } = await this.settlement.record(
      invoice,
      {
        number,
        at: this.clock.now(),
        outcome: 'succeeded',
        code: null,
        requestKey: null,
        transfer: event.kind === 'transfer_received',
      },
      ['open', 'pending', 'failed'],
      tx,
    );
    return { result: 'applied', decided };
  }

  /**
   * A charge that answered `pending` was refused. A refusal of any other attempt says nothing
   * new: a charge that answered at once is already recorded, and a later one may have paid.
   */
  private async failed(
    event: Extract<GatewayEvent, { kind: 'charge_failed' }>,
    tx: Tx,
  ): Promise<Applied> {
    const invoiceId = parseInvoiceReference(event.reference);
    const invoice = invoiceId === null ? null : await this.settlement.find(invoiceId, tx);
    if (invoice === null) {
      return { result: 'ignored', why: 'no invoice has this reference' };
    }
    const number = attemptOfIdempotencyKey(invoice._id.toHexString(), event.idempotencyKey);
    const last = invoice.attempts.at(-1);
    if (invoice.status !== 'pending' || number === null || last?.number !== number) {
      return { result: 'ignored', why: 'the refused charge is not the one being decided' };
    }
    const { invoice: decided } = await this.settlement.record(
      invoice,
      { number, at: this.clock.now(), outcome: 'failed', code: event.code, requestKey: null },
      ['pending'],
      tx,
    );
    return { result: 'applied', decided };
  }
}

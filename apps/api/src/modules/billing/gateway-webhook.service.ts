import { Injectable, Logger } from '@nestjs/common';
import type { GatewayEvent, PaymentProvider } from '@plp/contracts';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { BillingClock } from './billing-clock.js';
import { BillingEventsRepository, GatewayEventSeenError } from './billing-events.repository.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { parseInvoiceReference, parseMethodSetupReference } from './domain/billing-references.js';
import { attemptOfIdempotencyKey } from './domain/invoice-state.js';
import { InvoiceSettlement } from './invoice-settlement.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** What became of an event: applied now, applied before, or ignored with why. */
export type WebhookOutcome =
  { result: 'applied' } | { result: 'duplicate' } | { result: 'ignored'; why: string };

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
    private readonly events: BillingEventsRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly settlement: InvoiceSettlement,
    private readonly clock: BillingClock,
    private readonly transactions: TransactionRunner,
  ) {}

  async receive(provider: PaymentProvider, event: GatewayEvent): Promise<WebhookOutcome> {
    let outcome: WebhookOutcome;
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
    return outcome;
  }

  private apply(event: GatewayEvent, tx: Tx): Promise<WebhookOutcome> {
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

  /** The card of a setup the owner started: it replaces the saved one. */
  private async methodSaved(
    event: Extract<GatewayEvent, { kind: 'method_saved' }>,
    tx: Tx,
  ): Promise<WebhookOutcome> {
    const setup = parseMethodSetupReference(event.reference);
    if (setup === null) {
      return { result: 'ignored', why: 'the reference names no card setup' };
    }
    const ref = { workspaceId: setup.workspaceId };
    const at = this.clock.now();
    if (!(await this.subscriptions.setPaymentMethod(ref, event.method, at, tx))) {
      return { result: 'ignored', why: 'no workspace has this reference' };
    }
    await this.log.record(ref, { at, actorId: setup.userId, action: 'payment_method_changed' }, tx);
    return { result: 'applied' };
  }

  /** A charge or transfer paid the invoice, unless something decided it for good before. */
  private async paid(
    event: Extract<GatewayEvent, { kind: 'charge_succeeded' | 'transfer_received' }>,
    tx: Tx,
  ): Promise<WebhookOutcome> {
    const invoiceId = parseInvoiceReference(event.reference);
    const invoice = invoiceId === null ? null : await this.settlement.find(invoiceId, tx);
    if (invoice === null) {
      return { result: 'ignored', why: 'no invoice has this reference' };
    }
    if (event.amount !== invoice.amount) {
      return { result: 'ignored', why: 'the amount is not the invoice’s' };
    }
    if (invoice.status === 'paid') {
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
    await this.settlement.record(
      invoice,
      { number, at: this.clock.now(), outcome: 'succeeded', code: null, requestKey: null },
      ['open', 'pending', 'failed'],
      tx,
    );
    return { result: 'applied' };
  }

  /**
   * A charge that answered `pending` was refused. A refusal of any other attempt says nothing
   * new: a charge that answered at once is already recorded, and a later one may have paid.
   */
  private async failed(
    event: Extract<GatewayEvent, { kind: 'charge_failed' }>,
    tx: Tx,
  ): Promise<WebhookOutcome> {
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
    await this.settlement.record(
      invoice,
      { number, at: this.clock.now(), outcome: 'failed', code: event.code, requestKey: null },
      ['pending'],
      tx,
    );
    return { result: 'applied' };
  }
}

import type { BillingCycle, ChargeOutcome, InvoiceStatus, SubscriptionFacts } from '@plp/contracts';
import { daysLeftOf } from './proration.js';

/** A paid or void invoice never changes again (ADR-035, §2 rule 12). */
export const FINAL_INVOICE_STATUSES: readonly InvoiceStatus[] = ['paid', 'void'];

/** Statuses a charge may start from: never one that is decided or still being decided. */
export const CHARGEABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = ['open', 'failed'];

export function isFinalInvoiceStatus(status: InvoiceStatus): boolean {
  return FINAL_INVOICE_STATUSES.includes(status);
}

/** The invoice's status once a charge answered `outcome`. */
export function statusAfterCharge(outcome: ChargeOutcome): Exclude<InvoiceStatus, 'void'> {
  switch (outcome) {
    case 'succeeded':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'pending';
    case 'unknown':
      // The gateway may have charged: the invoice is not decided either way.
      return 'open';
  }
}

/**
 * The number of the next charge of an invoice, whose idempotency key at the gateway is
 * `{invoiceId}-{number}`. After an unknown outcome the same number is used again, so the gateway
 * answers that charge instead of making a second one; an attempt the API never recorded (it
 * stopped while waiting for the gateway) is reused the same way, since nothing follows it.
 */
export function nextAttemptNumber(
  attempts: readonly { number: number; outcome: ChargeOutcome }[],
): number {
  const last = attempts.at(-1);
  if (last === undefined) {
    return 1;
  }
  return last.outcome === 'unknown' ? last.number : last.number + 1;
}

/** The idempotency key of attempt `number` of an invoice (ADR-035). */
export function chargeIdempotencyKey(invoiceId: string, number: number): string {
  return `${invoiceId}-${number}`;
}

/** The attempt an idempotency key names, when it is one of this invoice's; null otherwise. */
export function attemptOfIdempotencyKey(invoiceId: string, key: string): number | null {
  const match = /^([a-f0-9]{24})-([1-9]\d{0,5})$/.exec(key);
  return match?.[1] === invoiceId && match[2] !== undefined ? Number(match[2]) : null;
}

/** What an invoice pays for, as far as deciding whether it still applies. */
export interface InvoicePurpose {
  status: InvoiceStatus;
  /** The plan it changes from; null for a period's renewal (T3). */
  from: { planId: string; cycle: BillingCycle } | null;
  /** Paying it ends the trial. */
  endsTrial: boolean;
  /** For an upgrade, when it was quoted: its amount pays for the days left from then. */
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Whether "Thanh toán lại" may charge the invoice now: it is unpaid and not being decided, and what
 * it pays for still applies. Paying for the end of a trial needs the trial still unpaid; an
 * upgrade needs the subscription still on the plan and period it was priced for. A renewal (T3)
 * stays payable until it is paid.
 *
 * An upgrade is priced for the days left when it was quoted. One the gateway refused (`failed`) is
 * paid again only while that count is unchanged, the day of the quote: later it would charge for
 * days already gone, so choosing the plan again gives the new amount. One whose outcome is unknown
 * (`open`) stays payable for its whole period: paying it again asks the gateway about that same
 * charge with the same key, and is how the owner learns whether it went through.
 */
export function invoicePayable(
  invoice: InvoicePurpose,
  facts: Pick<SubscriptionFacts, 'planId' | 'cycle' | 'trialEndsAt' | 'periodEnd'>,
  now: Date,
): boolean {
  if (!CHARGEABLE_INVOICE_STATUSES.includes(invoice.status)) {
    return false;
  }
  if (invoice.endsTrial) {
    return facts.trialEndsAt !== null;
  }
  if (invoice.from === null) {
    return true;
  }
  return (
    facts.trialEndsAt === null &&
    facts.planId === invoice.from.planId &&
    facts.cycle === invoice.from.cycle &&
    facts.periodEnd.getTime() === invoice.periodEnd.getTime() &&
    now.getTime() < invoice.periodEnd.getTime() &&
    (invoice.status === 'open' ||
      daysLeftOf(invoice.periodEnd, invoice.periodStart) === daysLeftOf(invoice.periodEnd, now))
  );
}

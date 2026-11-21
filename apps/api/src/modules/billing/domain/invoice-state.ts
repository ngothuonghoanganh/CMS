import type {
  BillingCycle,
  ChargeOutcome,
  InvoiceKind,
  InvoicePaymentMethod,
  InvoiceStatus,
  SubscriptionFacts,
} from '@plp/contracts';
import { daysLeftOf } from './proration.js';

/** A paid or void invoice never changes again (ADR-035, §2 rule 12). */
export const FINAL_INVOICE_STATUSES: readonly InvoiceStatus[] = ['paid', 'void'];

/** Statuses a charge may start from: never one that is decided or still being decided. */
export const CHARGEABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = ['open', 'failed'];

/**
 * A bank transfer waiting for its confirmation (T3) may still be paid by card instead: nothing is
 * being decided at the gateway for it, and a transfer that arrives after is refunded outside.
 */
const WITH_TRANSFER_WAITING: readonly InvoiceStatus[] = ['open', 'failed', 'pending'];

export function isFinalInvoiceStatus(status: InvoiceStatus): boolean {
  return FINAL_INVOICE_STATUSES.includes(status);
}

/** A transfer waits for the gateway's confirmation: `pending`, paid by transfer. */
export function awaitsTransfer(invoice: Pick<InvoicePurpose, 'status' | 'method'>): boolean {
  return invoice.status === 'pending' && invoice.method === 'transfer';
}

/** The statuses a charge of this invoice may record its outcome from. */
export function chargeableStatusesOf(
  invoice: Pick<InvoicePurpose, 'status' | 'method'>,
): readonly InvoiceStatus[] {
  return awaitsTransfer(invoice) ? WITH_TRANSFER_WAITING : CHARGEABLE_INVOICE_STATUSES;
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
  kind: InvoiceKind;
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
  /** The plan it changes from; null for the charge at the end of a trial or period (T3). */
  from: { planId: string; cycle: BillingCycle } | null;
  /** Paying it ends the trial. */
  endsTrial: boolean;
  /** For an upgrade, when it was quoted: its amount pays for the days left from then. */
  periodStart: Date;
  periodEnd: Date;
}

/**
 * What an invoice is for (ADR-035, T2 and T3):
 *
 * - `start_paid`: "Thanh toán ngay" during or after the trial; its period starts when it is paid;
 * - `upgrade`: a higher plan for the days left of a paid period;
 * - `trial_end`: the job's charge when the trial ends, for the period from the trial's end;
 * - `renewal`: the job's charge when a period ends, for the next period from that end;
 * - `restart`: "Thanh toán ngay" after a canceled plan stopped; its period starts when paid.
 */
export type InvoicePurposeKind = 'start_paid' | 'upgrade' | 'trial_end' | 'renewal' | 'restart';

export function purposeOf(
  invoice: Pick<InvoicePurpose, 'kind' | 'from' | 'endsTrial'>,
): InvoicePurposeKind {
  if (invoice.kind === 'upgrade') {
    return 'upgrade';
  }
  if (invoice.endsTrial) {
    return invoice.from === null ? 'trial_end' : 'start_paid';
  }
  return invoice.from === null ? 'renewal' : 'restart';
}

/** Its period starts when it is paid, however late after it was quoted. */
export function startsWhenPaid(
  invoice: Pick<InvoicePurpose, 'kind' | 'from' | 'endsTrial'>,
): boolean {
  const purpose = purposeOf(invoice);
  return purpose === 'start_paid' || purpose === 'restart';
}

/**
 * Whether "Thanh toán lại" may charge the invoice now: it is unpaid and not being decided (a
 * transfer waiting may be paid by card instead), and what it pays for still applies. Paying for
 * the end of a trial needs the trial still unpaid; an upgrade needs the subscription still on the
 * plan and period it was priced for. A renewal (T3) stays payable until it is paid, while the
 * subscription still waits for the period it pays; starting a canceled plan again, while it is
 * still stopped.
 *
 * An upgrade is priced for the days left when it was quoted. One the gateway refused (`failed`) is
 * paid again only while that count is unchanged, the day of the quote: later it would charge for
 * days already gone, so choosing the plan again gives the new amount. One whose outcome is unknown
 * (`open`) stays payable for its whole period: paying it again asks the gateway about that same
 * charge with the same key, and is how the owner learns whether it went through.
 */
export function invoicePayable(
  invoice: InvoicePurpose,
  facts: Pick<
    SubscriptionFacts,
    'planId' | 'cycle' | 'trialEndsAt' | 'periodEnd' | 'cancelAtPeriodEnd'
  >,
  now: Date,
): boolean {
  if (!chargeableStatusesOf(invoice).includes(invoice.status)) {
    return false;
  }
  switch (purposeOf(invoice)) {
    case 'start_paid':
      return facts.trialEndsAt !== null;
    case 'trial_end':
      return facts.trialEndsAt?.getTime() === invoice.periodStart.getTime();
    case 'renewal':
      return (
        facts.trialEndsAt === null && facts.periodEnd.getTime() === invoice.periodStart.getTime()
      );
    case 'restart':
      return (
        facts.trialEndsAt === null &&
        facts.cancelAtPeriodEnd &&
        now.getTime() >= facts.periodEnd.getTime()
      );
    case 'upgrade':
      return upgradePayable(invoice, facts, now);
  }
}

/**
 * Whether "Chuyển khoản" may start for the invoice (T3): a period's charge (a renewal, the end of a
 * trial, a plan paid now) that the card did not pay, or whose transfer already waits (asked
 * again). Never one whose charge may have gone through (`open`), nor an upgrade, whose amount
 * holds for the day of its quote only.
 */
export function invoiceTransferable(
  invoice: InvoicePurpose,
  facts: Parameters<typeof invoicePayable>[1],
  now: Date,
): boolean {
  return (
    invoice.kind === 'subscription' &&
    (invoice.status === 'failed' || awaitsTransfer(invoice)) &&
    invoicePayable(invoice, facts, now)
  );
}

function upgradePayable(
  invoice: InvoicePurpose,
  facts: Pick<SubscriptionFacts, 'planId' | 'cycle' | 'trialEndsAt' | 'periodEnd'>,
  now: Date,
): boolean {
  if (invoice.from === null) {
    return false;
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

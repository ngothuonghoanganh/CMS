import type {
  AccessLevel,
  BillingCycle,
  ChargeOutcome,
  InvoiceKind,
  InvoicePaymentMethod,
  InvoiceStatus,
  PaymentDeclineCode,
  SubscriptionFacts,
} from '@plp/contracts';
import { periodEndOf } from './billing-period.js';
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
export function awaitsTransfer(invoice: {
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
}): boolean {
  return invoice.status === 'pending' && invoice.method === 'transfer';
}

/**
 * The invoice of a renewal by bank transfer (T4), made before its period, still waiting for the
 * transfer: nothing failed, and no card was tried since.
 */
export function awaitsRenewalTransfer(invoice: {
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
  transferRenewal?: boolean;
}): boolean {
  return invoice.transferRenewal === true && awaitsTransfer(invoice);
}

/**
 * Whether a card charge of the invoice is being decided (`pending` by card) or may have gone
 * through (`open`): nothing may void it, since the money may be taken.
 */
export function chargeUndecided(invoice: {
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
}): boolean {
  return invoice.status === 'open' || (invoice.status === 'pending' && invoice.method === 'card');
}

/** The statuses a charge of this invoice may record its outcome from. */
export function chargeableStatusesOf(invoice: {
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
}): readonly InvoiceStatus[] {
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

/** What an invoice of the plan pays for, as far as deciding whether it still applies. */
export interface PlanInvoicePurpose {
  kind: Exclude<InvoiceKind, 'marketplace'>;
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

/** What a marketplace invoice pays for (ADR-036): one item, at the amount it was quoted for. */
export interface MarketplaceInvoicePurpose {
  kind: 'marketplace';
  status: InvoiceStatus;
  method: InvoicePaymentMethod;
  amount: number;
  item: { itemId: string };
}

export type InvoicePurpose = PlanInvoicePurpose | MarketplaceInvoicePurpose;

/**
 * What a marketplace invoice's item is to its workspace now (ADR-036): whether it is on sale, its
 * price, and whether the workspace holds its licence. The marketplace module answers it
 * (`MarketplacePurchaseHooks`).
 */
export interface ItemStanding {
  listed: boolean;
  price: number;
  licensed: boolean;
}

/**
 * What an invoice is for (ADR-035, T2 and T3; ADR-036):
 *
 * - `start_paid`: "Thanh toán ngay" during or after the trial; its period starts when it is paid;
 * - `upgrade`: a higher plan for the days left of a paid period;
 * - `trial_end`: the job's charge when the trial ends, for the period from the trial's end;
 * - `renewal`: the job's charge when a period ends, for the next period from that end;
 * - `restart`: "Thanh toán ngay" after a canceled plan stopped; its period starts when paid;
 * - `marketplace`: one item of the template marketplace; paying it grants the licence and never
 *   changes the plan.
 */
export type InvoicePurposeKind =
  'start_paid' | 'upgrade' | 'trial_end' | 'renewal' | 'restart' | 'marketplace';

export function purposeOf(invoice: {
  kind: InvoiceKind;
  from: PlanInvoicePurpose['from'];
  endsTrial: boolean;
}): InvoicePurposeKind {
  if (invoice.kind === 'marketplace') {
    return 'marketplace';
  }
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
  invoice: Pick<PlanInvoicePurpose, 'kind' | 'from' | 'endsTrial'>,
): boolean {
  const purpose = purposeOf(invoice);
  return purpose === 'start_paid' || purpose === 'restart';
}

/**
 * The period a payment at `at` gives the invoice instead of the one it was made for; null when
 * that one stays (ADR-035, T2 and T3). A plan paid now starts when it is paid. The charge of a
 * period (the end of a trial, a renewal) paid once that period has ended, at its end or after,
 * starts a fresh one when it is paid, on the same plan and cycle: nobody pays for a cycle that
 * passed, and no charge for the next one is due at once. Paid before its end, and for an upgrade,
 * the period stays as invoiced.
 */
export function periodPaidAt(
  invoice: Pick<PlanInvoicePurpose, 'kind' | 'from' | 'endsTrial' | 'periodEnd'> & {
    cycle: BillingCycle;
  },
  at: Date,
): { start: Date; end: Date } | null {
  const purpose = purposeOf(invoice);
  const ended =
    (purpose === 'renewal' || purpose === 'trial_end') &&
    at.getTime() >= invoice.periodEnd.getTime();
  return startsWhenPaid(invoice) || ended
    ? { start: at, end: periodEndOf(at, invoice.cycle) }
    : null;
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
  invoice: PlanInvoicePurpose,
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
    case 'marketplace':
      return false;
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
 * Whether "Thanh toán lại" may charge a marketplace invoice now (ADR-036). One whose outcome is
 * unknown (`open`) may: paying again asks the gateway about that charge with the same key, and
 * pays for the item whatever became of it on the marketplace or the plan. A refused one (`failed`)
 * only while the item is still on sale at the amount of the invoice and the workspace may buy:
 * paying it again is a new charge for the item, which a read-only workspace may not make, since
 * its plan comes first. Neither once the workspace holds the item: what it paid for is gone, and
 * the billing job voids it when it is still undecided.
 */
export function marketplaceInvoicePayable(
  invoice: Pick<MarketplaceInvoicePurpose, 'status' | 'method' | 'amount'>,
  standing: ItemStanding,
  access: AccessLevel,
): boolean {
  if (standing.licensed) {
    return false;
  }
  switch (invoice.status) {
    case 'open':
      return true;
    case 'failed':
      return access === 'full' && standing.listed && standing.price === invoice.amount;
    default:
      return false;
  }
}

/**
 * Whether "Thanh toán lại" of a marketplace invoice charges the card for the item anew (ADR-036):
 * one the gateway refused. Its rules are a purchase's: refused in a read-only workspace, and
 * blocked by any other charge of the workspace still being decided. Paying an undecided one only
 * asks the gateway about the charge already made, with its key.
 */
export function buysAgain(invoice: Pick<InvoicePurpose, 'kind' | 'status'>): boolean {
  return invoice.kind === 'marketplace' && invoice.status === 'failed';
}

/**
 * Whether "Thanh toán lại" may charge the invoice now, whatever it pays for: the plan's rules
 * (`invoicePayable`), or a marketplace item's (`marketplaceInvoicePayable`) with its `standing`
 * and the workspace's `access`. A plan's invoice stays payable in a read-only workspace: paying it
 * is how the workspace leaves that state.
 */
export function payableOf(
  invoice: InvoicePurpose,
  facts: Parameters<typeof invoicePayable>[1],
  now: Date,
  standing: ItemStanding | undefined,
  access: AccessLevel,
): boolean {
  if (invoice.kind !== 'marketplace') {
    return invoicePayable(invoice, facts, now);
  }
  if (standing === undefined) {
    throw new Error(
      `No standing of ${invoice.item.itemId} to decide whether its invoice is payable`,
    );
  }
  return marketplaceInvoicePayable(invoice, standing, access);
}

/**
 * Whether "Chuyển khoản" may start for the invoice (T3): a period's charge (a renewal, the end of a
 * trial, a plan paid now) that the card did not pay, or whose transfer already waits (asked
 * again). Never one whose charge may have gone through (`open`), nor an upgrade, whose amount
 * holds for the day of its quote only, nor a marketplace item, which is paid by card only.
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
  invoice: PlanInvoicePurpose,
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

/** What a purchase sent again with its `Idempotency-Key` answers (`purchaseReplayOf`). */
export type PurchaseReplay =
  | { kind: 'paid' }
  | { kind: 'pending' }
  /** No charge of it was recorded (the API stopped before): charge it with attempt 1's key. */
  | { kind: 'charge' }
  | { kind: 'unknown' }
  | { kind: 'failed'; code: PaymentDeclineCode }
  | { kind: 'not_payable' };

/**
 * What a purchase sent again with its `Idempotency-Key` answers (ADR-036): its invoice as it is
 * now, never a second charge. Paid: 200; a charge the gateway is deciding: 202; refused: 402;
 * unknown: 503, and "Thanh toán lại" asks the gateway. One voided after a refusal (a new purchase
 * of the item replaced it) answers its refusal; one voided without one (its purpose was gone) is no
 * longer payable. One whose charge the API never recorded is charged now, with attempt 1's key, so
 * the gateway answers that charge if it got there.
 */
export function purchaseReplayOf(invoice: {
  status: InvoiceStatus;
  attempts: readonly { outcome: ChargeOutcome; code: PaymentDeclineCode | null }[];
}): PurchaseReplay {
  const last = invoice.attempts.at(-1);
  switch (invoice.status) {
    case 'paid':
      return { kind: 'paid' };
    case 'pending':
      return { kind: 'pending' };
    case 'open':
      return last === undefined ? { kind: 'charge' } : { kind: 'unknown' };
    case 'failed':
      return { kind: 'failed', code: last?.code ?? 'card_declined' };
    case 'void':
      return last?.outcome === 'failed'
        ? { kind: 'failed', code: last.code ?? 'card_declined' }
        : { kind: 'not_payable' };
  }
}

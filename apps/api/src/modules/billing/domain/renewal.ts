import {
  type BillingCycle,
  cardValidAt,
  type PaymentMethod,
  type Plan,
  type PlanCatalog,
  type RenewalBlocker,
  type ScheduledChange,
  type SubscriptionFacts,
} from '@plp/contracts';
import { DAY_MS, periodEndOf } from './billing-period.js';

/** The catalog's numbers of a subscription's life (ADR-035, T3 and T4). */
export type BillingPolicy = Pick<
  PlanCatalog,
  'graceDays' | 'expiringSoonDays' | 'trialReminderDays' | 'retryDays' | 'transferLeadDays'
>;

/** What the end of a trial or a period charges: the next period, on the plan it will have then. */
export interface RenewalTerms {
  plan: Plan;
  cycle: BillingCycle;
  amount: number;
  /**
   * The old period's (or trial's) end. A payment once this period has ended starts it when paid
   * instead (`periodPaidAt`).
   */
  periodStart: Date;
  periodEnd: Date;
}

/**
 * The period that follows the trial or the current period (ADR-035, T3). A trial's plan changed
 * at once while it lasted, so its plan and cycle are the ones charged; a paid period moves to its
 * scheduled change, if any. The new period starts where the old one ended, by the calendar rule
 * of `periodEndOf`, when it is paid before its own end.
 */
export function renewalTermsOf(
  facts: Pick<
    SubscriptionFacts,
    'planId' | 'cycle' | 'trialEndsAt' | 'periodEnd' | 'scheduledChange'
  >,
  planOf: (planId: string) => Plan,
): RenewalTerms {
  const choice =
    facts.trialEndsAt === null && facts.scheduledChange !== null
      ? facts.scheduledChange
      : { planId: facts.planId, cycle: facts.cycle };
  const plan = planOf(choice.planId);
  const periodStart = facts.trialEndsAt ?? facts.periodEnd;
  return {
    plan,
    cycle: choice.cycle,
    amount: plan.prices[choice.cycle],
    periodStart,
    periodEnd: periodEndOf(periodStart, choice.cycle),
  };
}

/** Why the card cannot pay at `at`: none saved, or it expires before; null when it can. */
export function renewalBlockerOf(
  method: Pick<PaymentMethod, 'expMonth' | 'expYear'> | null,
  at: Date,
): RenewalBlocker | null {
  if (method === null) {
    return 'no_payment_method';
  }
  return cardValidAt(method, at) ? null : 'card_expires';
}

/** When the trial or the paid period ends: what renews, or stops. */
export function currentEndOf(facts: Pick<SubscriptionFacts, 'trialEndsAt' | 'periodEnd'>): Date {
  return facts.trialEndsAt ?? facts.periodEnd;
}

/**
 * The change scheduled for the end of the period while a renewal may still apply it (ADR-035,
 * T3). "Hủy gói" leaves it stored, so "Giữ lại gói" brings back the renewal the owner chose; it
 * applies only then, since no renewal follows a cancellation. Once the canceled plan has stopped,
 * nothing is left to apply it to.
 */
export function scheduledChangeOf(
  facts: Pick<
    SubscriptionFacts,
    'trialEndsAt' | 'periodEnd' | 'cancelAtPeriodEnd' | 'scheduledChange'
  >,
  at: Date,
): ScheduledChange | null {
  const stopped = facts.cancelAtPeriodEnd && at.getTime() >= currentEndOf(facts).getTime();
  return stopped ? null : facts.scheduledChange;
}

/**
 * When the next period's invoice is made for a renewal by bank transfer (T4): `transferLeadDays`
 * before the trial or period ends.
 */
export function transferInvoiceAtOf(
  facts: Pick<SubscriptionFacts, 'trialEndsAt' | 'periodEnd'>,
  policy: Pick<BillingPolicy, 'transferLeadDays'>,
): Date {
  return new Date(currentEndOf(facts).getTime() - policy.transferLeadDays * DAY_MS);
}

/**
 * Whether the next period's invoice for a bank transfer is to be made at `at` (T4): the plan renews
 * by transfer, nothing is due or paid for that period yet, and its time came. A paid period's
 * invoice is made at its end at the latest; a trial's only before the trial ends, so choosing the
 * transfer once the trial is over gives no grace (as `cardAfterTrial`).
 */
export function transferInvoiceDue(
  facts: Pick<
    SubscriptionFacts,
    | 'trialEndsAt'
    | 'periodEnd'
    | 'cancelAtPeriodEnd'
    | 'failedSince'
    | 'openInvoiceId'
    | 'renewalMethod'
    | 'renewalInvoiceId'
    | 'prepaid'
  >,
  policy: Pick<BillingPolicy, 'transferLeadDays'>,
  at: Date,
): boolean {
  const time = at.getTime();
  return (
    facts.renewalMethod === 'transfer' &&
    !facts.cancelAtPeriodEnd &&
    !paymentUnderWay(facts) &&
    facts.renewalInvoiceId === null &&
    facts.prepaid === null &&
    time >= transferInvoiceAtOf(facts, policy).getTime() &&
    (facts.trialEndsAt === null || time < facts.trialEndsAt.getTime())
  );
}

/**
 * Whether a payment of the period is under way or due: a failed charge, or an invoice the
 * subscription waits for (a charge being decided, a transfer).
 */
export function paymentUnderWay(
  facts: Pick<SubscriptionFacts, 'failedSince' | 'openInvoiceId'>,
): boolean {
  return facts.failedSince !== null || facts.openInvoiceId !== null;
}

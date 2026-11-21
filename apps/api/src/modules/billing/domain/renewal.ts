import {
  type BillingCycle,
  cardValidAt,
  type PaymentMethod,
  type Plan,
  type PlanCatalog,
  type RenewalBlocker,
  type SubscriptionFacts,
} from '@plp/contracts';
import { periodEndOf } from './billing-period.js';

/** The catalog's numbers of a subscription's life (ADR-035, T3). */
export type BillingPolicy = Pick<
  PlanCatalog,
  'graceDays' | 'expiringSoonDays' | 'trialReminderDays' | 'retryDays'
>;

/** What the end of a trial or a period charges: the next period, on the plan it will have then. */
export interface RenewalTerms {
  plan: Plan;
  cycle: BillingCycle;
  amount: number;
  /** The old period's (or trial's) end: a late payment never moves the calendar. */
  periodStart: Date;
  periodEnd: Date;
}

/**
 * The period that follows the trial or the current period (ADR-035, T3). A trial's plan changed
 * at once while it lasted, so its plan and cycle are the ones charged; a paid period moves to its
 * scheduled change, if any. The new period starts where the old one ended, by the calendar rule
 * of `periodEndOf`, whenever it is paid.
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
 * Whether a payment of the period is under way or due: a failed charge, or an invoice the
 * subscription waits for (a charge being decided, a transfer).
 */
export function paymentUnderWay(
  facts: Pick<SubscriptionFacts, 'failedSince' | 'openInvoiceId'>,
): boolean {
  return facts.failedSince !== null || facts.openInvoiceId !== null;
}

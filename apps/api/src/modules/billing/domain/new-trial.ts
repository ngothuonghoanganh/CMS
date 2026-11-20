import type { PlanCatalog, SubscriptionFacts } from '@plp/contracts';

const DAY_MS = 86_400_000;

/**
 * The subscription a workspace starts with (ADR-035): the catalog's trial plan for its number of
 * days, from `now`, at no charge. The trial is the first period; its end is the subscription's
 * next job (charging, or `trial_expired` without a payment method).
 */
export function newTrial(catalog: Pick<PlanCatalog, 'trial'>, now: Date): SubscriptionFacts {
  const trialEndsAt = new Date(now.getTime() + catalog.trial.days * DAY_MS);
  return {
    planId: catalog.trial.planId,
    // The cycle the owner pays in once the trial ends; they choose it while trialing.
    cycle: 'monthly',
    trialEndsAt,
    periodStart: now,
    periodEnd: trialEndsAt,
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    openInvoiceId: null,
    failedSince: null,
    paymentMethod: null,
    billingInfo: null,
    nextActionAt: trialEndsAt,
    lockedUntil: null,
    version: 0,
  };
}

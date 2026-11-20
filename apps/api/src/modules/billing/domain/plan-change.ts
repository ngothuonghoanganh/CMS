import type {
  BillingCycle,
  Plan,
  PlanChangeUnavailableReason,
  SubscriptionFacts,
} from '@plp/contracts';
import { periodEndOf } from './billing-period.js';
import { prorateUpgrade } from './proration.js';

/** What choosing a plan does at one moment (ADR-035, amended for T2). */
export type PlanChange =
  | { mode: 'unchanged' }
  | { mode: 'trial_change' }
  | {
      mode: 'start_paid';
      amount: number;
      periodStart: Date;
      periodEnd: Date;
    }
  | {
      mode: 'upgrade';
      amount: number;
      /** The days left of the paid period, from now to its end. */
      periodStart: Date;
      periodEnd: Date;
      remainingDays: number;
      periodDays: number;
    }
  | { mode: 'unavailable'; reason: PlanChangeUnavailableReason };

export interface PlanChoiceInput {
  facts: Pick<
    SubscriptionFacts,
    | 'planId'
    | 'cycle'
    | 'trialEndsAt'
    | 'periodStart'
    | 'periodEnd'
    | 'failedSince'
    | 'openInvoiceId'
  >;
  /** The plan the subscription is on, and the one chosen with its cycle. */
  current: Plan;
  target: Plan;
  cycle: BillingCycle;
  /** Pay for the chosen plan at once, which ends the trial. */
  payNow: boolean;
  now: Date;
}

/**
 * What choosing `target` in `cycle` does at `now`:
 *
 * - Until the trial is paid for (`trialEndsAt` set): with `payNow`, the trial ends and the first
 *   period of the chosen plan is charged in full from now (`start_paid`), during the trial or
 *   after it; without it, the trial's plan changes for free while the trial lasts, and nothing
 *   but paying is possible after it (`payment_required`).
 * - In a paid period: a higher price in the same cycle applies at once for the difference of the
 *   days left (`upgrade`). An unpaid period comes first (`unpaid`); a lower or equal price, or
 *   another cycle, waits for the period's end (`scheduled_change`, T3).
 */
export function planChangeOf(input: PlanChoiceInput): PlanChange {
  const { facts, current, target, cycle, payNow, now } = input;
  const same = facts.planId === target.id && facts.cycle === cycle;

  if (facts.trialEndsAt !== null) {
    if (payNow) {
      return {
        mode: 'start_paid',
        amount: target.prices[cycle],
        periodStart: now,
        periodEnd: periodEndOf(now, cycle),
      };
    }
    if (now.getTime() >= facts.trialEndsAt.getTime()) {
      return { mode: 'unavailable', reason: 'payment_required' };
    }
    return same ? { mode: 'unchanged' } : { mode: 'trial_change' };
  }

  if (same) {
    return { mode: 'unchanged' };
  }
  const unpaid =
    now.getTime() >= facts.periodEnd.getTime() ||
    facts.failedSince !== null ||
    facts.openInvoiceId !== null;
  if (unpaid) {
    return { mode: 'unavailable', reason: 'unpaid' };
  }
  if (cycle !== facts.cycle || target.prices[cycle] <= current.prices[cycle]) {
    return { mode: 'unavailable', reason: 'scheduled_change' };
  }
  const proration = prorateUpgrade({
    fromPrice: current.prices[cycle],
    toPrice: target.prices[cycle],
    periodStart: facts.periodStart,
    periodEnd: facts.periodEnd,
    now,
  });
  return {
    mode: 'upgrade',
    amount: proration.amount,
    periodStart: now,
    periodEnd: facts.periodEnd,
    remainingDays: proration.remainingDays,
    periodDays: proration.periodDays,
  };
}

/** Whether the change charges: it needs a saved, valid card and a confirmed amount. */
export function chargesNow(
  change: PlanChange,
): change is Extract<PlanChange, { mode: 'start_paid' | 'upgrade' }> {
  return change.mode === 'start_paid' || change.mode === 'upgrade';
}

import type { Plan, SubscriptionFacts } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { periodEndOf } from './billing-period.js';
import { chargesNow, type PlanChoiceInput, planChangeOf } from './plan-change.js';

const DAY = 86_400_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const at = (days: number) => new Date(START.getTime() + days * DAY);

const plan = (id: string, monthly: number, yearly: number): Plan => ({
  id,
  name: id,
  fit: '',
  prices: { monthly, yearly },
  limits: { sites: 1, members: 3, aiUses: 20, automationRuns: 0, customDomains: 1 },
  features: { automation: false, customRoles: false },
});
const BASIC = plan('basic', 199_000, 1_990_000);
const AGENCY = plan('agency', 599_000, 5_990_000);
const BUSINESS = plan('business', 1_490_000, 14_900_000);
const SAME_PRICE = plan('studio', 599_000, 5_990_000);

type Facts = PlanChoiceInput['facts'];
const trial: Facts = {
  planId: 'agency',
  cycle: 'monthly',
  trialEndsAt: at(14),
  periodStart: START,
  periodEnd: at(14),
  failedSince: null,
  openInvoiceId: null,
};
const paid: Facts = { ...trial, trialEndsAt: null, periodEnd: at(30) };

function choose(
  facts: Pick<SubscriptionFacts, keyof Facts>,
  target: Plan,
  options: Partial<Omit<PlanChoiceInput, 'facts' | 'target'>> = {},
) {
  return planChangeOf({
    facts,
    current: AGENCY,
    target,
    cycle: 'monthly',
    payNow: false,
    now: at(3),
    ...options,
  });
}

describe('planChangeOf during the trial', () => {
  it('changes the plan or cycle for free, and keeps the same choice', () => {
    expect(choose(trial, BASIC)).toEqual({ mode: 'trial_change' });
    expect(choose(trial, BUSINESS, { cycle: 'yearly' })).toEqual({ mode: 'trial_change' });
    expect(choose(trial, AGENCY)).toEqual({ mode: 'unchanged' });
    expect(chargesNow(choose(trial, BASIC))).toBe(false);
  });

  it('pays the first whole period from now when asked, which ends the trial', () => {
    const change = choose(trial, BUSINESS, { payNow: true });
    expect(change).toEqual({
      mode: 'start_paid',
      amount: 1_490_000,
      periodStart: at(3),
      periodEnd: periodEndOf(at(3), 'monthly'),
    });
    expect(chargesNow(change)).toBe(true);
    expect(choose(trial, AGENCY, { payNow: true, cycle: 'yearly' })).toMatchObject({
      mode: 'start_paid',
      amount: 5_990_000,
      periodEnd: periodEndOf(at(3), 'yearly'),
    });
  });

  it('only takes payment once the trial is over', () => {
    expect(choose(trial, BASIC, { now: at(14) })).toEqual({
      mode: 'unavailable',
      reason: 'payment_required',
    });
    expect(choose(trial, AGENCY, { now: at(20) })).toEqual({
      mode: 'unavailable',
      reason: 'payment_required',
    });
    expect(choose(trial, BASIC, { now: at(20), payNow: true })).toMatchObject({
      mode: 'start_paid',
      amount: 199_000,
      periodStart: at(20),
    });
  });
});

describe('planChangeOf in a paid period', () => {
  it('upgrades at once for the days left', () => {
    expect(choose(paid, BUSINESS, { now: at(18) })).toEqual({
      mode: 'upgrade',
      amount: 357_000,
      periodStart: at(18),
      periodEnd: at(30),
      remainingDays: 12,
      periodDays: 30,
    });
    // `payNow` changes nothing once the trial is paid.
    expect(choose(paid, BUSINESS, { now: at(18), payNow: true }).mode).toBe('upgrade');
  });

  it('keeps a lower or equal price, or another cycle, for the end of the period (T3)', () => {
    const later = { mode: 'unavailable', reason: 'scheduled_change' };
    expect(choose(paid, BASIC)).toEqual(later);
    expect(choose(paid, SAME_PRICE)).toEqual(later);
    expect(choose(paid, AGENCY, { cycle: 'yearly' })).toEqual(later);
    expect(choose(paid, BUSINESS, { cycle: 'yearly' })).toEqual(later);
  });

  it('asks for the unpaid period first', () => {
    const unpaid = { mode: 'unavailable', reason: 'unpaid' };
    expect(choose(paid, BUSINESS, { now: at(30) })).toEqual(unpaid);
    expect(choose({ ...paid, failedSince: at(2) }, BUSINESS)).toEqual(unpaid);
    expect(choose({ ...paid, openInvoiceId: '674000000000000000000abc' }, BUSINESS)).toEqual(
      unpaid,
    );
  });

  it('changes nothing for the plan and cycle it has', () => {
    expect(choose(paid, AGENCY)).toEqual({ mode: 'unchanged' });
    expect(choose(paid, AGENCY, { payNow: true })).toEqual({ mode: 'unchanged' });
  });
});

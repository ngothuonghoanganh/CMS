import type { Plan } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { periodEndOf } from './billing-period.js';
import { renewalBlockerOf, renewalTermsOf } from './renewal.js';

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
const PLANS: Record<string, Plan> = {
  basic: plan('basic', 199_000, 1_990_000),
  agency: plan('agency', 599_000, 5_990_000),
};
const planOf = (id: string): Plan => {
  const found = PLANS[id];
  if (found === undefined) {
    throw new Error(`No plan ${id}`);
  }
  return found;
};

const paid = {
  planId: 'agency',
  cycle: 'monthly' as const,
  trialEndsAt: null,
  periodEnd: at(30),
  scheduledChange: null,
};

describe('the next period (ADR-035, T3)', () => {
  it('follows the period on its plan and cycle, from its end', () => {
    expect(renewalTermsOf(paid, planOf)).toEqual({
      plan: PLANS['agency'],
      cycle: 'monthly',
      amount: 599_000,
      periodStart: at(30),
      periodEnd: periodEndOf(at(30), 'monthly'),
    });
  });

  it('moves to the change scheduled for the end of the period', () => {
    const downgrade = { ...paid, scheduledChange: { planId: 'basic', cycle: 'yearly' as const } };
    expect(renewalTermsOf(downgrade, planOf)).toMatchObject({
      plan: PLANS['basic'],
      cycle: 'yearly',
      amount: 1_990_000,
      periodStart: at(30),
      periodEnd: periodEndOf(at(30), 'yearly'),
    });
  });

  it('follows a trial from its end, on the plan chosen during it', () => {
    const trial = { ...paid, planId: 'basic', trialEndsAt: at(14), periodEnd: at(14) };
    expect(renewalTermsOf(trial, planOf)).toMatchObject({
      plan: PLANS['basic'],
      amount: 199_000,
      periodStart: at(14),
      periodEnd: periodEndOf(at(14), 'monthly'),
    });
  });
});

describe('renewalBlockerOf', () => {
  it('needs a card that still works at the renewal', () => {
    expect(renewalBlockerOf(null, at(30))).toBe('no_payment_method');
    expect(renewalBlockerOf({ expMonth: 12, expYear: 2030 }, at(30))).toBeNull();
    expect(renewalBlockerOf({ expMonth: 11, expYear: 2026 }, at(29))).toBeNull();
    expect(renewalBlockerOf({ expMonth: 11, expYear: 2026 }, at(30))).toBe('card_expires');
  });
});

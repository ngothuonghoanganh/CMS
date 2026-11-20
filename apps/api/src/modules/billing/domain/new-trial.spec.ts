import { subscriptionStatusOf } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newTrial } from './new-trial.js';

const NOW = new Date('2026-11-20T08:30:00.000Z');
const POLICY = { graceDays: 7, expiringSoonDays: 7 };

describe('a new workspace’s trial (ADR-035)', () => {
  it('runs the catalog’s plan for its days from now, with nothing to pay', () => {
    const trial = newTrial({ trial: { planId: 'agency', days: 14 } }, NOW);
    expect(trial).toMatchObject({
      planId: 'agency',
      cycle: 'monthly',
      trialEndsAt: new Date('2026-12-04T08:30:00.000Z'),
      periodStart: NOW,
      periodEnd: new Date('2026-12-04T08:30:00.000Z'),
      nextActionAt: new Date('2026-12-04T08:30:00.000Z'),
      cancelAtPeriodEnd: false,
      paymentMethod: null,
      failedSince: null,
      openInvoiceId: null,
      version: 0,
    });
  });

  it('shows "Dùng thử · còn 14 ngày" when it starts', () => {
    expect(
      subscriptionStatusOf(newTrial({ trial: { planId: 'agency', days: 14 } }, NOW), POLICY, NOW),
    ).toMatchObject({ state: 'trialing', access: 'full', trialDaysLeft: 14 });
  });

  it('takes the number of days from the catalog, not from code', () => {
    const trial = newTrial({ trial: { planId: 'business', days: 30 } }, NOW);
    expect(trial.planId).toBe('business');
    expect(trial.trialEndsAt).toEqual(new Date('2026-12-20T08:30:00.000Z'));
  });
});

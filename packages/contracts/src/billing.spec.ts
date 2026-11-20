import { describe, expect, it } from 'vitest';
import {
  billingInfoSchema,
  cardValidAt,
  findPlan,
  type PlanCatalog,
  planCatalogSchema,
  type SubscriptionFacts,
  subscriptionStatusOf,
} from './billing.js';

/** The temporary numbers of ADR-035. */
const CATALOG: PlanCatalog = {
  trial: { planId: 'agency', days: 14 },
  graceDays: 7,
  expiringSoonDays: 7,
  plans: [
    {
      id: 'basic',
      name: 'Cơ bản',
      fit: 'Một doanh nghiệp, vài trang',
      prices: { monthly: 199_000, yearly: 1_990_000 },
      limits: { sites: 1, members: 3, aiUses: 20, automationRuns: 0, customDomains: 1 },
      features: { automation: false, customRoles: false },
    },
    {
      id: 'agency',
      name: 'Agency',
      fit: 'Nhiều site khách hàng',
      prices: { monthly: 599_000, yearly: 5_990_000 },
      limits: { sites: 5, members: 10, aiUses: 100, automationRuns: 2000, customDomains: 10 },
      features: { automation: true, customRoles: false },
    },
  ],
};

const DAY = 86_400_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const at = (days: number, ms = 0) => new Date(START.getTime() + days * DAY + ms);

/** A paid month from START with a card valid long after. */
function paid(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    planId: 'agency',
    cycle: 'monthly',
    trialEndsAt: null,
    periodStart: START,
    periodEnd: at(30),
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    openInvoiceId: null,
    failedSince: null,
    paymentMethod: { token: 'tok_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
    billingInfo: null,
    nextActionAt: at(30),
    lockedUntil: null,
    version: 1,
    ...overrides,
  };
}

/** A 14-day trial from START, without a card. */
function trial(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return paid({ trialEndsAt: at(14), periodEnd: at(14), paymentMethod: null, ...overrides });
}

const INVOICE = '64b0000000000000000000f1';

function statusAt(facts: SubscriptionFacts, now: Date) {
  return subscriptionStatusOf(facts, CATALOG, now);
}

describe('the plan catalog', () => {
  it('takes the temporary numbers of ADR-035', () => {
    expect(planCatalogSchema.parse(CATALOG)).toEqual(CATALOG);
    expect(findPlan(CATALOG, 'basic')?.name).toBe('Cơ bản');
    expect(findPlan(CATALOG, 'gold')).toBeUndefined();
  });

  function issuesOf(catalog: unknown) {
    const result = planCatalogSchema.safeParse(catalog);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  }
  const [basic, agency] = CATALOG.plans;
  if (!basic || !agency) {
    throw new Error('The catalog of the test has two plans');
  }

  it('refuses a price in fractions of a đồng, or a field it does not know', () => {
    expect(
      issuesOf({ ...CATALOG, plans: [{ ...basic, prices: { monthly: 199_000.5, yearly: 0 } }] }),
    ).toContain('plans.0.prices.monthly');
    expect(issuesOf({ ...CATALOG, plans: [{ ...basic, color: 'red' }, agency] })).toEqual([
      'plans.0',
    ]);
  });

  it('refuses two plans with one id, and a trial of a plan it does not have', () => {
    expect(issuesOf({ ...CATALOG, plans: [agency, agency] })).toEqual(['plans.1.id']);
    expect(issuesOf({ ...CATALOG, trial: { planId: 'gold', days: 14 } })).toEqual(['trial.planId']);
  });

  it('keeps every plan under the hard limits of ADR-014, ADR-021 and ADR-022', () => {
    const over = { ...agency, limits: { ...agency.limits, sites: 101, members: 101 } };
    expect(issuesOf({ ...CATALOG, plans: [basic, over] })).toEqual([
      'plans.1.limits.sites',
      'plans.1.limits.members',
    ]);
    const domains = { ...basic, limits: { ...basic.limits, customDomains: 6 } };
    expect(issuesOf({ ...CATALOG, plans: [domains, agency] })).toEqual([
      'plans.0.limits.customDomains',
    ]);
  });

  it('gives no automation runs to a plan without automation', () => {
    const runs = { ...basic, limits: { ...basic.limits, automationRuns: 10 } };
    expect(issuesOf({ ...CATALOG, plans: [runs, agency] })).toEqual([
      'plans.0.limits.automationRuns',
    ]);
  });
});

describe('the state of a subscription (ADR-035)', () => {
  describe('a trial', () => {
    it('is `trialing` with the days left, rounded up, until it ends', () => {
      expect(statusAt(trial(), START)).toEqual({
        state: 'trialing',
        access: 'full',
        trialDaysLeft: 14,
        graceEndsAt: null,
      });
      expect(statusAt(trial(), at(4, 1)).trialDaysLeft).toBe(10);
      expect(statusAt(trial(), at(14, -1))).toMatchObject({
        state: 'trialing',
        trialDaysLeft: 1,
      });
    });

    it('expires into read-only at its last millisecond, without a payment under way', () => {
      expect(statusAt(trial(), at(14))).toEqual({
        state: 'trial_expired',
        access: 'read_only',
        trialDaysLeft: null,
        graceEndsAt: null,
      });
    });

    it('is overdue when charging at its end failed, with the grace from the failure', () => {
      const failed = trial({ failedSince: at(14) });
      expect(statusAt(failed, at(14))).toEqual({
        state: 'past_due',
        access: 'full',
        trialDaysLeft: null,
        graceEndsAt: at(21),
      });
      expect(statusAt(failed, at(21, -1)).access).toBe('full');
      expect(statusAt(failed, at(21)).access).toBe('read_only');
    });

    it('waits for a transfer as `pending_payment`, the grace from the end of the trial', () => {
      const transfer = trial({ openInvoiceId: INVOICE });
      expect(statusAt(transfer, at(15))).toMatchObject({
        state: 'pending_payment',
        access: 'full',
        graceEndsAt: at(21),
      });
      expect(statusAt(transfer, at(21)).access).toBe('read_only');
    });

    it('with a payment method, is overdue with the grace until the charge job has run', () => {
      // The job that charges is due at the end of the trial and runs after it: until it records
      // an outcome, the trial is unpaid with the grace from its end, not read-only.
      const card = trial({
        paymentMethod: {
          token: 'tok_1',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2030,
        },
      });
      expect(statusAt(card, at(14, 1))).toEqual({
        state: 'past_due',
        access: 'full',
        trialDaysLeft: null,
        graceEndsAt: at(21),
      });
      expect(statusAt(card, at(21, -1)).access).toBe('full');
      expect(statusAt(card, at(21))).toMatchObject({ state: 'past_due', access: 'read_only' });
    });

    it('canceled during the trial, is `canceled` once it ends', () => {
      expect(statusAt(trial({ cancelAtPeriodEnd: true }), at(13)).state).toBe('trialing');
      expect(statusAt(trial({ cancelAtPeriodEnd: true }), at(14))).toMatchObject({
        state: 'canceled',
        access: 'read_only',
      });
    });
  });

  describe('a paid period', () => {
    it('is `active` while it renews by itself', () => {
      expect(statusAt(paid(), START)).toEqual({
        state: 'active',
        access: 'full',
        trialDaysLeft: null,
        graceEndsAt: null,
      });
      expect(statusAt(paid(), at(29)).state).toBe('active');
    });

    it('is `expiring_soon` in its last 7 days without a payment method', () => {
      const noCard = paid({ paymentMethod: null });
      expect(statusAt(noCard, at(23, -1)).state).toBe('active');
      expect(statusAt(noCard, at(23))).toMatchObject({ state: 'expiring_soon', access: 'full' });
      expect(statusAt(noCard, at(30, -1)).state).toBe('expiring_soon');
    });

    it('is `expiring_soon` when the card expires before the next charge', () => {
      // The period ends on 01/12: a card of 11/2026 no longer works then, one of 12/2026 does.
      const expiring = paid({
        paymentMethod: { token: 't', brand: 'visa', last4: '0002', expMonth: 11, expYear: 2026 },
      });
      expect(statusAt(expiring, at(25)).state).toBe('expiring_soon');
      const valid = paid({
        paymentMethod: { token: 't', brand: 'visa', last4: '0002', expMonth: 12, expYear: 2026 },
      });
      expect(statusAt(valid, at(25)).state).toBe('active');
    });

    it('is `cancel_scheduled` until its end, then `canceled` and read-only', () => {
      const canceling = paid({ cancelAtPeriodEnd: true, paymentMethod: null });
      expect(statusAt(canceling, at(29))).toMatchObject({
        state: 'cancel_scheduled',
        access: 'full',
      });
      expect(statusAt(canceling, at(30))).toEqual({
        state: 'canceled',
        access: 'read_only',
        trialDaysLeft: null,
        graceEndsAt: null,
      });
    });

    it('is `past_due` after a failed renewal, read-only once the 7 days of grace pass', () => {
      const failed = paid({ failedSince: at(30, 3_600_000) });
      expect(statusAt(failed, at(31))).toEqual({
        state: 'past_due',
        access: 'full',
        trialDaysLeft: null,
        graceEndsAt: at(37, 3_600_000),
      });
      expect(statusAt(failed, at(37, 3_599_999)).access).toBe('full');
      expect(statusAt(failed, at(37, 3_600_000)).access).toBe('read_only');
    });

    it('is `past_due` from its end when no renewal ran, so a late job never keeps it open', () => {
      expect(statusAt(paid(), at(30))).toMatchObject({
        state: 'past_due',
        access: 'full',
        graceEndsAt: at(37),
      });
      expect(statusAt(paid(), at(37)).access).toBe('read_only');
    });

    it('is `pending_payment` while a transfer waits, with the grace from its end', () => {
      const transfer = paid({ openInvoiceId: INVOICE });
      expect(statusAt(transfer, at(29))).toMatchObject({
        state: 'pending_payment',
        access: 'full',
        graceEndsAt: at(37),
      });
      expect(statusAt(transfer, at(37))).toMatchObject({
        state: 'pending_payment',
        access: 'read_only',
      });
    });

    it('stays `past_due` when an invoice is open after a failed charge', () => {
      const both = paid({ openInvoiceId: INVOICE, failedSince: at(30) });
      expect(statusAt(both, at(31)).state).toBe('past_due');
    });

    it('turns read-only at the failure itself with no grace', () => {
      const failed = paid({ failedSince: at(30) });
      expect(subscriptionStatusOf(failed, { ...CATALOG, graceDays: 0 }, at(30)).access).toBe(
        'read_only',
      );
    });
  });
});

describe('a card', () => {
  it('works through the last day of its month', () => {
    const card = { expMonth: 2, expYear: 2027 };
    expect(cardValidAt(card, new Date('2027-02-28T23:59:59.999Z'))).toBe(true);
    expect(cardValidAt(card, new Date('2027-03-01T00:00:00.000Z'))).toBe(false);
    expect(cardValidAt({ expMonth: 12, expYear: 2026 }, new Date('2026-12-31T12:00:00Z'))).toBe(
      true,
    );
    expect(cardValidAt({ expMonth: 12, expYear: 2026 }, new Date('2027-01-01T00:00:00Z'))).toBe(
      false,
    );
  });
});

describe('billing info', () => {
  it('takes a tax code of 10 digits or 13 with a branch, without spaces', () => {
    const info = {
      companyName: 'Công ty TNHH Mây Xanh',
      taxCode: '0312 345 678',
      address: '12 Nguyễn Huệ, Quận 1, TP.HCM',
      email: 'ketoan@mayxanh.vn',
    };
    expect(billingInfoSchema.parse(info).taxCode).toBe('0312345678');
    expect(billingInfoSchema.parse({ ...info, taxCode: '0312345678-001' }).taxCode).toBe(
      '0312345678-001',
    );
    expect(billingInfoSchema.safeParse({ ...info, taxCode: '031234567' }).success).toBe(false);
  });
});

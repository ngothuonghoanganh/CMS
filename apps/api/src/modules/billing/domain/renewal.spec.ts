import type { Plan } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { periodEndOf } from './billing-period.js';
import {
  renewalBlockerOf,
  renewalTermsOf,
  scheduledChangeOf,
  transferInvoiceAtOf,
  transferInvoiceDue,
} from './renewal.js';

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

describe('scheduledChangeOf', () => {
  const downgrade = {
    ...paid,
    cancelAtPeriodEnd: false,
    scheduledChange: { planId: 'basic', cycle: 'monthly' as const },
  };

  it('is the change the renewal applies, kept while "Hủy gói" stands', () => {
    expect(scheduledChangeOf(downgrade, at(10))).toEqual({ planId: 'basic', cycle: 'monthly' });
    // Still stored and still shown: "Giữ lại gói" before the end brings it back with the renewal.
    const canceled = { ...downgrade, cancelAtPeriodEnd: true };
    expect(scheduledChangeOf(canceled, at(29))).toEqual({ planId: 'basic', cycle: 'monthly' });
    // An unpaid renewal still charges the plan it names.
    expect(scheduledChangeOf(downgrade, at(31))).toEqual({ planId: 'basic', cycle: 'monthly' });
  });

  it('is none once the canceled plan has stopped: nothing is left to apply it to', () => {
    const canceled = { ...downgrade, cancelAtPeriodEnd: true };
    expect(scheduledChangeOf(canceled, at(30))).toBeNull();
    expect(scheduledChangeOf(canceled, at(45))).toBeNull();
  });
});

describe('the next period’s invoice for a bank transfer (T4)', () => {
  const POLICY = { transferLeadDays: 7 };
  const transfer = {
    trialEndsAt: null,
    periodEnd: at(30),
    cancelAtPeriodEnd: false,
    failedSince: null,
    openInvoiceId: null,
    renewalMethod: 'transfer' as const,
    renewalMethodChosenAt: at(1),
    renewalInvoiceId: null,
    prepaid: null,
  };

  it('is made 7 days before the end of the period or trial', () => {
    expect(transferInvoiceAtOf(transfer, POLICY)).toEqual(at(23));
    expect(transferInvoiceAtOf({ trialEndsAt: at(14), periodEnd: at(14) }, POLICY)).toEqual(at(7));
    expect(transferInvoiceDue(transfer, POLICY, at(22))).toBe(false);
    expect(transferInvoiceDue(transfer, POLICY, at(23))).toBe(true);
  });

  it('is made late, after a paid period or a trial it was chosen in, never after it for a trial', () => {
    expect(transferInvoiceDue(transfer, POLICY, at(30))).toBe(true);
    expect(transferInvoiceDue(transfer, POLICY, at(31))).toBe(true);
    const trial = { ...transfer, trialEndsAt: at(14), periodEnd: at(14) };
    expect(transferInvoiceDue(trial, POLICY, at(13))).toBe(true);
    // Chosen during the trial and not made in time (the job or the gateway down): made late.
    expect(transferInvoiceDue(trial, POLICY, at(14))).toBe(true);
    expect(transferInvoiceDue(trial, POLICY, at(16))).toBe(true);
    // Choosing the transfer once the trial is over gives no grace.
    expect(transferInvoiceDue({ ...trial, renewalMethodChosenAt: at(15) }, POLICY, at(15))).toBe(
      false,
    );
  });

  it('is made once, and not for a card, a cancellation, a payment due or a paid period', () => {
    const now = at(25);
    expect(transferInvoiceDue({ ...transfer, renewalMethod: 'card' }, POLICY, now)).toBe(false);
    expect(transferInvoiceDue({ ...transfer, renewalInvoiceId: 'inv' }, POLICY, now)).toBe(false);
    expect(transferInvoiceDue({ ...transfer, cancelAtPeriodEnd: true }, POLICY, now)).toBe(false);
    expect(transferInvoiceDue({ ...transfer, openInvoiceId: 'inv' }, POLICY, now)).toBe(false);
    expect(transferInvoiceDue({ ...transfer, failedSince: at(1) }, POLICY, now)).toBe(false);
    const prepaid = {
      invoiceId: 'inv',
      planId: 'agency',
      cycle: 'monthly' as const,
      periodStart: at(30),
      periodEnd: at(60),
    };
    expect(transferInvoiceDue({ ...transfer, prepaid }, POLICY, now)).toBe(false);
  });
});

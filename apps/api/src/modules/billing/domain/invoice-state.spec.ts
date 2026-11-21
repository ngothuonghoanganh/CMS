import { describe, expect, it } from 'vitest';
import {
  attemptOfIdempotencyKey,
  chargeIdempotencyKey,
  chargeableStatusesOf,
  type InvoicePurpose,
  invoicePayable,
  invoiceTransferable,
  isFinalInvoiceStatus,
  nextAttemptNumber,
  purposeOf,
  startsWhenPaid,
  statusAfterCharge,
} from './invoice-state.js';

const INVOICE_ID = '674000000000000000000abc';
const DAY = 86_400_000;
const NOW = new Date('2026-11-21T03:00:00.000Z');
const PERIOD_END = new Date(NOW.getTime() + 10 * DAY);

const paidPeriod = {
  planId: 'agency',
  cycle: 'monthly' as const,
  trialEndsAt: null,
  periodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
};
/** Quoted at NOW for the 10 days left of the period. */
const upgrade: InvoicePurpose = {
  kind: 'upgrade',
  method: 'card',
  status: 'failed',
  from: { planId: 'agency', cycle: 'monthly' },
  endsTrial: false,
  periodStart: NOW,
  periodEnd: PERIOD_END,
};

describe('invoice states', () => {
  it('never changes a paid or void invoice', () => {
    expect(isFinalInvoiceStatus('paid')).toBe(true);
    expect(isFinalInvoiceStatus('void')).toBe(true);
    expect(isFinalInvoiceStatus('failed')).toBe(false);
    expect(isFinalInvoiceStatus('open')).toBe(false);
    expect(isFinalInvoiceStatus('pending')).toBe(false);
  });

  it('follows the outcome of a charge; an unknown one leaves it undecided', () => {
    expect(statusAfterCharge('succeeded')).toBe('paid');
    expect(statusAfterCharge('failed')).toBe('failed');
    expect(statusAfterCharge('pending')).toBe('pending');
    expect(statusAfterCharge('unknown')).toBe('open');
  });
});

describe('charge attempts', () => {
  it('numbers them from 1, and repeats one whose outcome is unknown', () => {
    expect(nextAttemptNumber([])).toBe(1);
    expect(nextAttemptNumber([{ number: 1, outcome: 'failed' }])).toBe(2);
    expect(
      nextAttemptNumber([
        { number: 1, outcome: 'failed' },
        { number: 2, outcome: 'unknown' },
      ]),
    ).toBe(2);
    expect(
      nextAttemptNumber([
        { number: 1, outcome: 'unknown' },
        { number: 1, outcome: 'failed' },
      ]),
    ).toBe(2);
  });

  it('keys each attempt by the invoice and its number', () => {
    const key = chargeIdempotencyKey(INVOICE_ID, 3);
    expect(key).toBe(`${INVOICE_ID}-3`);
    expect(attemptOfIdempotencyKey(INVOICE_ID, key)).toBe(3);
    expect(attemptOfIdempotencyKey('674000000000000000000abd', key)).toBeNull();
    expect(attemptOfIdempotencyKey(INVOICE_ID, `${INVOICE_ID}-0`)).toBeNull();
    expect(attemptOfIdempotencyKey(INVOICE_ID, 'whatever')).toBeNull();
  });
});

describe('invoicePayable', () => {
  it('pays an upgrade again while the plan and period it was priced for last', () => {
    expect(invoicePayable(upgrade, paidPeriod, NOW)).toBe(true);
    expect(invoicePayable({ ...upgrade, status: 'open' }, paidPeriod, NOW)).toBe(true);
    expect(invoicePayable(upgrade, { ...paidPeriod, planId: 'business' }, NOW)).toBe(false);
    expect(invoicePayable(upgrade, { ...paidPeriod, cycle: 'yearly' }, NOW)).toBe(false);
    expect(
      invoicePayable(
        upgrade,
        { ...paidPeriod, periodEnd: new Date(PERIOD_END.getTime() + DAY) },
        NOW,
      ),
    ).toBe(false);
    expect(invoicePayable(upgrade, paidPeriod, PERIOD_END)).toBe(false);
  });

  it('pays a refused upgrade again only while it charges for the days left now', () => {
    // Still 10 days left, counting the started one: the amount is the quote's.
    expect(invoicePayable(upgrade, paidPeriod, new Date(NOW.getTime() + DAY - 60_000))).toBe(true);
    // A day later it would charge for a day already gone.
    expect(invoicePayable(upgrade, paidPeriod, new Date(NOW.getTime() + DAY))).toBe(false);
    expect(invoicePayable(upgrade, paidPeriod, new Date(NOW.getTime() + 8 * DAY))).toBe(false);
  });

  it('keeps an upgrade of unknown outcome payable for its period, to learn that outcome', () => {
    const unknown: InvoicePurpose = { ...upgrade, status: 'open' };
    expect(invoicePayable(unknown, paidPeriod, new Date(NOW.getTime() + 8 * DAY))).toBe(true);
    expect(invoicePayable(unknown, paidPeriod, PERIOD_END)).toBe(false);
    expect(invoicePayable(unknown, { ...paidPeriod, planId: 'business' }, NOW)).toBe(false);
  });

  it('pays the end of a trial again while the trial is unpaid', () => {
    const start: InvoicePurpose = {
      ...upgrade,
      kind: 'subscription',
      from: { planId: 'basic', cycle: 'monthly' },
      endsTrial: true,
    };
    expect(invoicePayable(start, { ...paidPeriod, trialEndsAt: NOW }, NOW)).toBe(true);
    expect(invoicePayable(start, paidPeriod, NOW)).toBe(false);
  });

  it('never charges an invoice that is decided or being decided', () => {
    for (const status of ['paid', 'void', 'pending'] as const) {
      expect(invoicePayable({ ...upgrade, status }, paidPeriod, NOW)).toBe(false);
    }
  });

  /** The job's charge for the period after PERIOD_END (T3). */
  const renewal: InvoicePurpose = {
    ...upgrade,
    kind: 'subscription',
    from: null,
    periodStart: PERIOD_END,
    periodEnd: new Date(PERIOD_END.getTime() + 30 * DAY),
  };

  it('keeps a renewal payable until it is paid, while the period it follows is the current one', () => {
    const late = new Date(PERIOD_END.getTime() + 20 * DAY);
    expect(invoicePayable(renewal, paidPeriod, late)).toBe(true);
    expect(invoicePayable({ ...renewal, status: 'open' }, paidPeriod, late)).toBe(true);
    // Paid otherwise, the subscription moved on to the next period.
    expect(invoicePayable(renewal, { ...paidPeriod, periodEnd: renewal.periodEnd }, late)).toBe(
      false,
    );
  });

  it('pays the charge at the end of a trial while that trial is unpaid', () => {
    const trialEnd: InvoicePurpose = { ...renewal, endsTrial: true, periodStart: NOW };
    expect(purposeOf(trialEnd)).toBe('trial_end');
    expect(invoicePayable(trialEnd, { ...paidPeriod, trialEndsAt: NOW }, PERIOD_END)).toBe(true);
    expect(invoicePayable(trialEnd, paidPeriod, PERIOD_END)).toBe(false);
  });

  it('starts a canceled plan again while it is still stopped', () => {
    const restart: InvoicePurpose = {
      ...renewal,
      from: { planId: 'agency', cycle: 'monthly' },
      periodStart: PERIOD_END,
    };
    const canceled = { ...paidPeriod, cancelAtPeriodEnd: true };
    expect(purposeOf(restart)).toBe('restart');
    expect(invoicePayable(restart, canceled, PERIOD_END)).toBe(true);
    expect(invoicePayable(restart, canceled, NOW)).toBe(false);
    expect(invoicePayable(restart, paidPeriod, PERIOD_END)).toBe(false);
  });

  it('pays by card a transfer still waiting, and nothing else being decided', () => {
    const waiting: InvoicePurpose = { ...renewal, status: 'pending', method: 'transfer' };
    expect(chargeableStatusesOf(waiting)).toEqual(['open', 'failed', 'pending']);
    expect(chargeableStatusesOf({ ...waiting, method: 'card' })).toEqual(['open', 'failed']);
    expect(invoicePayable(waiting, paidPeriod, PERIOD_END)).toBe(true);
    expect(invoicePayable({ ...waiting, method: 'card' }, paidPeriod, PERIOD_END)).toBe(false);
  });
});

describe('invoice purposes (T3)', () => {
  it('start a period when paid only for a plan paid now', () => {
    const base = { kind: 'subscription' as const, from: null, endsTrial: false };
    const from = { planId: 'agency', cycle: 'monthly' as const };
    expect(purposeOf(base)).toBe('renewal');
    expect(startsWhenPaid(base)).toBe(false);
    expect(startsWhenPaid({ ...base, endsTrial: true })).toBe(false);
    expect(startsWhenPaid({ ...base, from, endsTrial: true })).toBe(true);
    expect(startsWhenPaid({ ...base, from })).toBe(true);
    expect(startsWhenPaid({ ...base, kind: 'upgrade', from })).toBe(false);
  });

  it('take a transfer for a period the card did not pay, never for an undecided one', () => {
    const renewal: InvoicePurpose = {
      kind: 'subscription',
      method: 'card',
      status: 'failed',
      from: null,
      endsTrial: false,
      periodStart: PERIOD_END,
      periodEnd: new Date(PERIOD_END.getTime() + 30 * DAY),
    };
    expect(invoiceTransferable(renewal, paidPeriod, PERIOD_END)).toBe(true);
    expect(
      invoiceTransferable({ ...renewal, status: 'pending', method: 'transfer' }, paidPeriod, NOW),
    ).toBe(true);
    expect(invoiceTransferable({ ...renewal, status: 'open' }, paidPeriod, PERIOD_END)).toBe(false);
    expect(invoiceTransferable({ ...renewal, status: 'pending' }, paidPeriod, PERIOD_END)).toBe(
      false,
    );
    expect(invoiceTransferable(upgrade, paidPeriod, NOW)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  attemptOfIdempotencyKey,
  chargeIdempotencyKey,
  type InvoicePurpose,
  invoicePayable,
  isFinalInvoiceStatus,
  nextAttemptNumber,
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
};
/** Quoted at NOW for the 10 days left of the period. */
const upgrade: InvoicePurpose = {
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

  it('keeps a renewal payable until it is paid', () => {
    expect(invoicePayable({ ...upgrade, from: null }, paidPeriod, PERIOD_END)).toBe(true);
  });
});

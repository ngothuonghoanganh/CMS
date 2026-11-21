import { describe, expect, it } from 'vitest';
import {
  attemptOfIdempotencyKey,
  chargeIdempotencyKey,
  chargeableStatusesOf,
  type InvoicePurpose,
  invoicePayable,
  invoiceTransferable,
  isFinalInvoiceStatus,
  type ItemStanding,
  type MarketplaceInvoicePurpose,
  marketplaceInvoicePayable,
  payableOf,
  purchaseReplayOf,
  nextAttemptNumber,
  purposeOf,
  periodPaidAt,
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

describe('marketplace invoices (ADR-036)', () => {
  const bought: MarketplaceInvoicePurpose = {
    kind: 'marketplace',
    method: 'card',
    status: 'failed',
    amount: 399_000,
    item: { itemId: 'mp-khai-truong-phong-tap' },
  };
  const onSale: ItemStanding = { listed: true, price: 399_000, licensed: false };

  it('are for an item, never a plan, and never take a transfer', () => {
    expect(purposeOf({ kind: 'marketplace', from: null, endsTrial: false })).toBe('marketplace');
    expect(invoiceTransferable(bought, paidPeriod, NOW)).toBe(false);
    expect(invoiceTransferable({ ...bought, status: 'pending' }, paidPeriod, NOW)).toBe(false);
  });

  it('pay again a refused one only while the item is on sale at its price and not held', () => {
    expect(marketplaceInvoicePayable(bought, onSale)).toBe(true);
    expect(marketplaceInvoicePayable(bought, { ...onSale, listed: false })).toBe(false);
    expect(marketplaceInvoicePayable(bought, { ...onSale, price: 499_000 })).toBe(false);
    expect(marketplaceInvoicePayable(bought, { ...onSale, licensed: true })).toBe(false);
  });

  it('pay again an undecided one even once the item left the sale or changed price', () => {
    const open = { ...bought, status: 'open' as const };
    expect(marketplaceInvoicePayable(open, onSale)).toBe(true);
    expect(marketplaceInvoicePayable(open, { listed: false, price: 0, licensed: false })).toBe(
      true,
    );
    // What it paid for is gone once the workspace holds the item another way.
    expect(marketplaceInvoicePayable(open, { ...onSale, licensed: true })).toBe(false);
  });

  it('never pay again one that is paid, void or being decided', () => {
    for (const status of ['paid', 'void', 'pending'] as const) {
      expect(marketplaceInvoicePayable({ ...bought, status }, onSale), status).toBe(false);
    }
  });

  it('decide with the item’s standing, and invoices of the plan with the plan', () => {
    expect(payableOf(bought, paidPeriod, NOW, onSale)).toBe(true);
    expect(payableOf(bought, paidPeriod, NOW, { ...onSale, licensed: true })).toBe(false);
    expect(() => payableOf(bought, paidPeriod, NOW, undefined)).toThrow(/standing/);
    expect(payableOf(upgrade, paidPeriod, NOW, undefined)).toBe(
      invoicePayable(upgrade, paidPeriod, NOW),
    );
  });
});

describe('a purchase sent again with its Idempotency-Key (ADR-036)', () => {
  const refused = { outcome: 'failed' as const, code: 'insufficient_funds' as const };
  const unknown = { outcome: 'unknown' as const, code: null };

  it('answers its invoice as it is now, never with a second charge', () => {
    expect(purchaseReplayOf({ status: 'paid', attempts: [unknown] })).toEqual({ kind: 'paid' });
    expect(purchaseReplayOf({ status: 'pending', attempts: [] })).toEqual({ kind: 'pending' });
    expect(purchaseReplayOf({ status: 'open', attempts: [unknown] })).toEqual({ kind: 'unknown' });
    expect(purchaseReplayOf({ status: 'failed', attempts: [refused] })).toEqual({
      kind: 'failed',
      code: 'insufficient_funds',
    });
  });

  it('charges one the API never charged, with the key of attempt 1', () => {
    expect(purchaseReplayOf({ status: 'open', attempts: [] })).toEqual({ kind: 'charge' });
  });

  it('answers a refusal replaced by a new purchase as refused, any other void as not payable', () => {
    expect(purchaseReplayOf({ status: 'void', attempts: [refused] })).toEqual({
      kind: 'failed',
      code: 'insufficient_funds',
    });
    expect(purchaseReplayOf({ status: 'void', attempts: [unknown] })).toEqual({
      kind: 'not_payable',
    });
  });
});

describe('the period a payment gives (ADR-035, T2 and T3)', () => {
  /** An instant given as Vietnamese wall time. */
  const vn = (local: string) => new Date(`${local}+07:00`);
  /** The renewal of a month that was to run from 30/11 to 30/12. */
  const renewal = {
    kind: 'subscription' as const,
    from: null,
    endsTrial: false,
    cycle: 'monthly' as const,
    periodEnd: vn('2026-12-30T10:00:00.000'),
  };

  it('keeps the period invoiced when it is paid before that period ends', () => {
    expect(periodPaidAt(renewal, vn('2026-12-07T09:00:00.000'))).toBeNull();
    expect(periodPaidAt(renewal, vn('2026-12-30T09:59:59.999'))).toBeNull();
    expect(periodPaidAt({ ...renewal, endsTrial: true }, vn('2026-12-01T00:00:00.000'))).toBeNull();
  });

  it('starts a fresh period from the payment once the period invoiced has ended, at its end too', () => {
    const atEnd = vn('2026-12-30T10:00:00.000');
    expect(periodPaidAt(renewal, atEnd)).toEqual({
      start: atEnd,
      end: vn('2027-01-30T10:00:00.000'),
    });
    // Paid two weeks after the month it was made for ended: that month is not paid for.
    const late = vn('2027-01-14T16:20:00.000');
    expect(periodPaidAt(renewal, late)).toEqual({
      start: late,
      end: vn('2027-02-14T16:20:00.000'),
    });
    // The end of a trial is the first period's charge: the same rule.
    expect(periodPaidAt({ ...renewal, endsTrial: true }, late)).toEqual({
      start: late,
      end: vn('2027-02-14T16:20:00.000'),
    });
  });

  it('counts the fresh period by the calendar rule: the 31st, a year', () => {
    const on31st = vn('2027-01-31T08:00:00.000');
    expect(periodPaidAt(renewal, on31st)).toEqual({
      start: on31st,
      end: vn('2027-02-28T08:00:00.000'),
    });
    const yearly = {
      ...renewal,
      cycle: 'yearly' as const,
      periodEnd: vn('2027-11-30T10:00:00.000'),
    };
    const lateYear = vn('2028-02-29T11:00:00.000');
    expect(periodPaidAt(yearly, vn('2027-11-29T10:00:00.000'))).toBeNull();
    expect(periodPaidAt(yearly, lateYear)).toEqual({
      start: lateYear,
      end: vn('2029-02-28T11:00:00.000'),
    });
  });

  it('starts a plan paid now from the payment, early or late, and never moves an upgrade', () => {
    const from = { planId: 'agency', cycle: 'monthly' as const };
    const early = vn('2026-12-01T10:00:00.000');
    const late = vn('2027-02-01T10:00:00.000');
    for (const paidNow of [
      { ...renewal, from },
      { ...renewal, from, endsTrial: true },
    ]) {
      expect(periodPaidAt(paidNow, early)).toEqual({
        start: early,
        end: vn('2027-01-01T10:00:00.000'),
      });
      expect(periodPaidAt(paidNow, late)).toEqual({
        start: late,
        end: vn('2027-03-01T10:00:00.000'),
      });
    }
    expect(periodPaidAt({ ...renewal, kind: 'upgrade', from }, early)).toBeNull();
    expect(periodPaidAt({ ...renewal, kind: 'upgrade', from }, late)).toBeNull();
  });
});

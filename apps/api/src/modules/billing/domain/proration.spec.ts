import { describe, expect, it } from 'vitest';
import { periodEndOf } from './billing-period.js';
import { prorateUpgrade } from './proration.js';

const DAY = 86_400_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const MONTH_END = new Date(START.getTime() + 30 * DAY);
const at = (days: number, ms = 0) => new Date(START.getTime() + days * DAY + ms);

/** Agency to Doanh nghiệp, monthly: 599.000đ → 1.490.000đ. */
const upgrade = (now: Date) =>
  prorateUpgrade({
    fromPrice: 599_000,
    toPrice: 1_490_000,
    periodStart: START,
    periodEnd: MONTH_END,
    now,
  });

describe('prorateUpgrade', () => {
  it('charges the whole difference at the start of the period', () => {
    expect(upgrade(START)).toEqual({ amount: 891_000, remainingDays: 30, periodDays: 30 });
  });

  it('charges the days left, rounded up to 1.000đ', () => {
    // 891.000 × 12 / 30 = 356.400 → 357.000.
    expect(upgrade(at(18))).toEqual({ amount: 357_000, remainingDays: 12, periodDays: 30 });
    // A started day counts whole: 12 days and a minute left cost 13 days.
    expect(upgrade(at(18, -60_000)).remainingDays).toBe(13);
  });

  it('charges one day on the last day, and at least 1.000đ', () => {
    // 891.000 / 30 = 29.700 → 30.000.
    expect(upgrade(at(30, -60_000))).toEqual({ amount: 30_000, remainingDays: 1, periodDays: 30 });
    const tiny = prorateUpgrade({
      fromPrice: 199_000,
      toPrice: 199_500,
      periodStart: START,
      periodEnd: MONTH_END,
      now: at(30, -1),
    });
    expect(tiny.amount).toBe(1000);
  });

  it('charges nothing once the period is over', () => {
    expect(upgrade(MONTH_END)).toEqual({ amount: 0, remainingDays: 0, periodDays: 30 });
    expect(upgrade(at(31)).amount).toBe(0);
  });

  it('charges nothing for the same or a lower price', () => {
    const same = prorateUpgrade({
      fromPrice: 599_000,
      toPrice: 599_000,
      periodStart: START,
      periodEnd: MONTH_END,
      now: at(3),
    });
    expect(same).toEqual({ amount: 0, remainingDays: 27, periodDays: 30 });
    const lower = prorateUpgrade({
      fromPrice: 599_000,
      toPrice: 199_000,
      periodStart: START,
      periodEnd: MONTH_END,
      now: at(3),
    });
    expect(lower.amount).toBe(0);
  });

  it('prorates a yearly cycle by the days of the year', () => {
    const yearEnd = periodEndOf(START, 'yearly');
    const yearly = prorateUpgrade({
      fromPrice: 5_990_000,
      toPrice: 14_900_000,
      periodStart: START,
      periodEnd: yearEnd,
      now: new Date(START.getTime() + 100 * DAY),
    });
    // 8.910.000 × 265 / 365 = 6.468.904,1… → 6.469.000.
    expect(yearly).toEqual({ amount: 6_469_000, remainingDays: 265, periodDays: 365 });
  });

  it('counts whole days even for a period with a leap day', () => {
    const start = new Date('2028-02-01T03:00:00.000Z');
    const end = periodEndOf(start, 'monthly');
    expect(
      prorateUpgrade({
        fromPrice: 0,
        toPrice: 290_000,
        periodStart: start,
        periodEnd: end,
        now: start,
      }),
    ).toEqual({ amount: 290_000, remainingDays: 29, periodDays: 29 });
  });
});

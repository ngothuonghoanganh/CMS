import { DAY_MS } from './billing-period.js';

/** Charges are whole thousands of đồng, rounded up (ADR-035). */
const ROUND_TO = 1000;

export interface UpgradeProration {
  /** In đồng, VAT included, a multiple of 1.000đ; 0 when the new price is not higher. */
  amount: number;
  /** Days left of the period, a started day counting whole; 0 once it ended. */
  remainingDays: number;
  /** The period's length in days. */
  periodDays: number;
}

/**
 * What an upgrade charges at `now` (ADR-035): the difference between the two prices of the cycle,
 * for the share of the period left, rounded up to 1.000đ. Days count whole: the last day of the
 * period still costs one day, so the owner always pays at least 1.000đ for a higher plan, and the
 * quote stays the same for the whole day it was read.
 */
export function prorateUpgrade(input: {
  fromPrice: number;
  toPrice: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): UpgradeProration {
  const periodDays = Math.max(
    1,
    Math.round((input.periodEnd.getTime() - input.periodStart.getTime()) / DAY_MS),
  );
  const left = input.periodEnd.getTime() - input.now.getTime();
  const remainingDays = left <= 0 ? 0 : Math.min(periodDays, Math.ceil(left / DAY_MS));
  const difference = input.toPrice - input.fromPrice;
  if (difference <= 0 || remainingDays === 0) {
    return { amount: 0, remainingDays, periodDays };
  }
  // Whole numbers below 2^53 (1e9 đ × 366 days): the division of two exact integers is exact
  // when its result is whole, and far from one otherwise, so the ceiling is right.
  const thousands = Math.ceil((difference * remainingDays) / (periodDays * ROUND_TO));
  return { amount: thousands * ROUND_TO, remainingDays, periodDays };
}

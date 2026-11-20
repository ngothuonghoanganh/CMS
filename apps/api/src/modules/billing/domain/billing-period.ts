import type { BillingCycle } from '@plp/contracts';

/** Vietnam has no daylight saving time: its wall clock is always UTC+7. */
const VN_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * When a period that starts at `start` ends (ADR-035): the same day and time in Vietnam one month
 * or one year later. A day the target month lacks becomes its last day, so a period from 31/01
 * ends on 28/02 (29/02 in a leap year), and a year from 29/02 ends on 28/02.
 */
export function periodEndOf(start: Date, cycle: BillingCycle): Date {
  const local = new Date(start.getTime() + VN_OFFSET_MS);
  const months = local.getUTCMonth() + (cycle === 'monthly' ? 1 : 12);
  const year = local.getUTCFullYear() + Math.floor(months / 12);
  const month = months % 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const endLocal = Date.UTC(
    year,
    month,
    Math.min(local.getUTCDate(), lastDayOfMonth),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return new Date(endLocal - VN_OFFSET_MS);
}

/** The calendar year in Vietnam of an instant: invoices are numbered per year. */
export function vnYearOf(at: Date): number {
  return new Date(at.getTime() + VN_OFFSET_MS).getUTCFullYear();
}

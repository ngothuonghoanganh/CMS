import { z } from 'zod';

/**
 * Calendar days in Vietnam (UTC+7, no daylight saving time). Lead counts, the inbox ranges and
 * the analytics board group by these days, so "7 ngày qua" means the same everywhere.
 */
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** A Vietnamese calendar day as "2026-10-25". */
export const vnDaySchema = z.iso.date();
export type VnDay = z.infer<typeof vnDaySchema>;

/** The Vietnamese calendar day of an instant. */
export function vnDayOf(at: Date): VnDay {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of a time of day ("10:15") on a Vietnamese calendar day. */
export function vnInstantOf(day: VnDay, time: string): Date {
  return new Date(Date.parse(`${day}T${time}:00.000Z`) - VN_OFFSET_MS);
}

/** "2026-10-24 16:42:07": the time in Vietnam of an instant, in a form spreadsheets read as a date. */
export function vnDateTimeOf(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** The instant a Vietnamese calendar day starts (00:00 in Vietnam, 17:00 UTC the day before). */
export function vnDayStart(day: VnDay): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - VN_OFFSET_MS);
}

export function addVnDays(day: VnDay, days: number): VnDay {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of calendar days from `from` to `to`, both included (1 for the same day). */
export function vnDaySpan(from: VnDay, to: VnDay): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) +
    1
  );
}

/** Instants from the start of `from` up to (not including) the start of the day after `to`. */
export interface InstantWindow {
  from: Date;
  to: Date;
}

export function vnDaysWindow(from: VnDay, to: VnDay): InstantWindow {
  return { from: vnDayStart(from), to: vnDayStart(addVnDays(to, 1)) };
}

/** Today and the `days - 1` days before it, in Vietnam: "7 ngày qua" is `recentDaysWindow(now, 7)`. */
export function recentDaysWindow(now: Date, days: number): InstantWindow {
  const today = vnDayOf(now);
  return vnDaysWindow(addVnDays(today, 1 - days), today);
}

/** Monday to Friday; public holidays are not taken out (ADR-017). */
function isWorkingDay(day: VnDay): boolean {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * The last instant (23:59:59.999 in Vietnam) of the `workingDays`-th working day after the day of
 * `receivedAt`: a request received on Friday 23/10 has 2 working days until Tuesday 27/10. A
 * request received on a weekend counts from the Monday after (ADR-017).
 */
export function businessDeadline(receivedAt: Date, workingDays: number): Date {
  let day = vnDayOf(receivedAt);
  for (let counted = 0; counted < workingDays;) {
    day = addVnDays(day, 1);
    if (isWorkingDay(day)) {
      counted += 1;
    }
  }
  return new Date(vnDayStart(addVnDays(day, 1)).getTime() - 1);
}

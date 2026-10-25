import { type AnalyticsRange, analyticsRangeDays, type VnDay } from '@plp/contracts';

const counts = new Intl.NumberFormat('vi-VN');
const rates = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "3.214" */
export function formatCount(value: number): string {
  return counts.format(value);
}

/** Leads per unique visitor: "2,0%"; "—" without visitors. */
export function conversionRate(leads: number, visitors: number): string {
  return visitors === 0 ? '—' : `${rates.format((leads / visitors) * 100)}%`;
}

const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'] as const;

function weekday(day: VnDay): number {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay();
}

/** "24/10" */
function dayMonth(day: VnDay): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** "CN" and "18/10": a day under the chart (board 11), in two parts that can stack. */
export function chartDayParts(day: VnDay): { weekday: string; date: string } {
  return { weekday: WEEKDAYS_SHORT[weekday(day)] ?? '', date: dayMonth(day) };
}

/** "CN 18/10" */
export function chartDayLabel(day: VnDay): string {
  const parts = chartDayParts(day);
  return `${parts.weekday} ${parts.date}`;
}

/** "Thứ 5, 22/10": a day in the tooltip. */
export function tooltipDayLabel(day: VnDay): string {
  return `${WEEKDAYS_LONG[weekday(day)] ?? ''}, ${dayMonth(day)}`;
}

/** "18/10 – 24/10/2026"; both years when the period spans two. */
export function periodLabel(period: { from: VnDay; to: VnDay }): string {
  const year = (day: VnDay) => day.slice(0, 4);
  const from =
    year(period.from) === year(period.to)
      ? dayMonth(period.from)
      : `${dayMonth(period.from)}/${year(period.from)}`;
  return `${from} – ${dayMonth(period.to)}/${year(period.to)}`;
}

/** "7 ngày trước: 2.870": the same number of days just before. */
export function previousLabel(range: AnalyticsRange, value: number): string {
  return `${analyticsRangeDays[range]} ngày trước: ${formatCount(value)}`;
}

/** Steps a count axis may take, times a power of ten: 0 / 150 / 300 / 450 as on board 11. */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 5, 10];

/**
 * Ticks of the visitors axis: 0 and `intervals` equal, clean steps that cover `max`. Counts never
 * get fractional ticks.
 */
export function niceTicks(max: number, intervals = 3): number[] {
  const raw = Math.max(max, 1) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    NICE_STEPS.map((factor) => factor * magnitude).find(
      (candidate) => candidate >= raw && Number.isInteger(candidate),
    ) ?? Math.ceil(raw);
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
}

/** How many days apart the chart labels its days: every day for a week, about weekly beyond. */
export function labelEvery(days: number): number {
  return Math.ceil(days / 7);
}

/**
 * How the chart labels the day at `index`, counted back from today so today always is labelled.
 * A `minor` label gives way on a narrow chart: every other one beyond a week, where labels are
 * dates; a week keeps all seven, as weekdays. `null` leaves the day unlabelled.
 */
export function dayLabelKind(index: number, days: number): 'major' | 'minor' | null {
  const back = days - 1 - index;
  const every = labelEvery(days);
  if (back % every !== 0) {
    return null;
  }
  return every === 1 || back % (every * 2) === 0 ? 'major' : 'minor';
}

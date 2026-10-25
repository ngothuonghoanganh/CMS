/**
 * Vietnamese date and time labels for the admin.
 *
 * Every label is computed in one fixed time zone, so the server render and the browser hydration
 * produce the same text whatever the machine's zone is. The product serves Vietnamese teams.
 */
export const ADMIN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type DateInput = Date | string | number;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function toDate(input: DateInput): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(input)}`);
  }
  return date;
}

function calendarParts(date: Date, timeZone: string): CalendarParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of partFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Days since the epoch of the calendar date, so two dates compare by calendar day. */
function dayNumber({ year, month, day }: CalendarParts): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
}

/** "15:02" */
export function formatTime(input: DateInput, timeZone = ADMIN_TIME_ZONE): string {
  const parts = calendarParts(toDate(input), timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** "24/10" */
export function formatDayMonth(input: DateInput, timeZone = ADMIN_TIME_ZONE): string {
  const parts = calendarParts(toDate(input), timeZone);
  return `${pad(parts.day)}/${pad(parts.month)}`;
}

/** "24/10/2026" */
export function formatDate(input: DateInput, timeZone = ADMIN_TIME_ZONE): string {
  const parts = calendarParts(toDate(input), timeZone);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
}

/** "24/10/2026 15:02" */
export function formatDateTime(input: DateInput, timeZone = ADMIN_TIME_ZONE): string {
  const parts = calendarParts(toDate(input), timeZone);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * How long ago something happened, as on the boards:
 * - "vừa xong" under a minute (and for a clock that runs slightly ahead);
 * - "{n} phút trước" under an hour;
 * - "{n} giờ trước" earlier the same day;
 * - "hôm qua, HH:mm" the previous calendar day;
 * - "dd/MM" earlier this year, "dd/MM/yyyy" before that.
 */
export function formatRelativeTime(
  input: DateInput,
  now: DateInput,
  timeZone = ADMIN_TIME_ZONE,
): string {
  const date = toDate(input);
  const reference = toDate(now);
  const elapsed = reference.getTime() - date.getTime();
  if (elapsed < MINUTE) {
    return 'vừa xong';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} phút trước`;
  }
  const then = calendarParts(date, timeZone);
  const today = calendarParts(reference, timeZone);
  const daysAgo = dayNumber(today) - dayNumber(then);
  if (daysAgo === 0) {
    return `${Math.floor(elapsed / HOUR)} giờ trước`;
  }
  if (daysAgo === 1) {
    return `hôm qua, ${pad(then.hour)}:${pad(then.minute)}`;
  }
  if (then.year === today.year) {
    return `${pad(then.day)}/${pad(then.month)}`;
  }
  return `${pad(then.day)}/${pad(then.month)}/${then.year}`;
}

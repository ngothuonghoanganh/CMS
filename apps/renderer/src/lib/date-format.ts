/** Visitors of these sites are in Vietnam; server-rendered times use Vietnam time. */
export const SITE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "dd/MM/yyyy HH:mm" in Vietnam time, e.g. "31/10/2026 15:00". */
export function formatDateTime(iso: string): string {
  const parts = dateTimeFormat.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Cannot format "${iso}" as a date and time`);
    }
    return value;
  };
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

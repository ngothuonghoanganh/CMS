import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatRelativeTime,
  formatTime,
} from './format';

// 24/10/2026 15:02 in Vietnam (UTC+7).
const now = new Date('2026-10-24T08:02:00.000Z');

function ago(milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

describe('formatRelativeTime', () => {
  it('says "vừa xong" under a minute and for timestamps slightly in the future', () => {
    expect(formatRelativeTime(now, now)).toBe('vừa xong');
    expect(formatRelativeTime(ago(59_000), now)).toBe('vừa xong');
    expect(formatRelativeTime(ago(-5_000), now)).toBe('vừa xong');
  });

  it('counts minutes under an hour', () => {
    expect(formatRelativeTime(ago(60_000), now)).toBe('1 phút trước');
    expect(formatRelativeTime(ago(59 * 60_000 + 59_000), now)).toBe('59 phút trước');
  });

  it('counts hours earlier the same day', () => {
    expect(formatRelativeTime(ago(2 * 3_600_000), now)).toBe('2 giờ trước');
    // 00:30 the same day in Vietnam.
    expect(formatRelativeTime('2026-10-23T17:30:00.000Z', now)).toBe('14 giờ trước');
  });

  it('says "hôm qua" with the time for the previous calendar day', () => {
    expect(formatRelativeTime('2026-10-23T09:20:00.000Z', now)).toBe('hôm qua, 16:20');
    // 23:50 yesterday, only 15 minutes before a reference just after midnight.
    expect(formatRelativeTime('2026-10-24T16:50:00.000Z', '2026-10-24T17:05:00.000Z')).toBe(
      '15 phút trước',
    );
    expect(formatRelativeTime('2026-10-24T15:00:00.000Z', '2026-10-24T18:00:00.000Z')).toBe(
      'hôm qua, 22:00',
    );
  });

  it('shows dd/MM earlier this year and dd/MM/yyyy before', () => {
    expect(formatRelativeTime('2026-10-01T03:00:00.000Z', now)).toBe('01/10');
    expect(formatRelativeTime('2026-01-01T00:00:00.000Z', now)).toBe('01/01');
    expect(formatRelativeTime('2025-12-31T10:00:00.000Z', now)).toBe('31/12/2025');
  });

  it('uses the Vietnamese calendar day, not UTC', () => {
    // 31/12/2025 23:30 UTC is already 01/01/2026 06:30 in Vietnam.
    expect(formatRelativeTime('2025-12-31T23:30:00.000Z', now)).toBe('01/01');
  });

  it('rejects an invalid date instead of printing "NaN"', () => {
    expect(() => formatRelativeTime('not a date', now)).toThrow(RangeError);
  });
});

describe('absolute formats', () => {
  it('formats date and time in Vietnam time', () => {
    expect(formatDateTime(now)).toBe('24/10/2026 15:02');
    expect(formatDate(now)).toBe('24/10/2026');
    expect(formatDayMonth('2026-10-01T03:00:00.000Z')).toBe('01/10');
    expect(formatTime('2026-10-24T17:05:00.000Z')).toBe('00:05');
  });

  it('accepts another time zone', () => {
    expect(formatDateTime(now, 'UTC')).toBe('24/10/2026 08:02');
  });
});

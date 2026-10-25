import { describe, expect, it } from 'vitest';
import {
  addVnDays,
  recentDaysWindow,
  vnDateTimeOf,
  vnDayOf,
  vnDaySpan,
  vnDayStart,
  vnDaysWindow,
} from './calendar.js';

describe('Vietnamese calendar days', () => {
  it('starts a day at 00:00 in Vietnam, 17:00 UTC the day before', () => {
    expect(vnDayStart('2026-10-25').toISOString()).toBe('2026-10-24T17:00:00.000Z');
    expect(vnDayOf(new Date('2026-10-24T16:59:59.999Z'))).toBe('2026-10-24');
    expect(vnDayOf(new Date('2026-10-24T17:00:00.000Z'))).toBe('2026-10-25');
  });

  it('writes the time in Vietnam for spreadsheets', () => {
    expect(vnDateTimeOf(new Date('2026-10-24T09:42:07.500Z'))).toBe('2026-10-24 16:42:07');
    expect(vnDateTimeOf(new Date('2026-12-31T18:00:00.000Z'))).toBe('2027-01-01 01:00:00');
  });

  it('adds days across months and years', () => {
    expect(addVnDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addVnDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addVnDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts both ends of a span', () => {
    expect(vnDaySpan('2026-10-25', '2026-10-25')).toBe(1);
    expect(vnDaySpan('2026-10-19', '2026-10-25')).toBe(7);
    expect(vnDaySpan('2026-10-26', '2026-10-25')).toBe(0);
    expect(vnDaySpan('2026-01-01', '2026-12-31')).toBe(365);
  });

  it('covers whole days from the start of the first to the start of the day after the last', () => {
    expect(vnDaysWindow('2026-10-01', '2026-10-31')).toEqual({
      from: new Date('2026-09-30T17:00:00.000Z'),
      to: new Date('2026-10-31T17:00:00.000Z'),
    });
  });

  it('"7 ngày qua" is today and the 6 days before, in Vietnam', () => {
    // 23:30 on 25 October in Vietnam.
    const now = new Date('2026-10-25T16:30:00.000Z');
    expect(recentDaysWindow(now, 7)).toEqual({
      from: new Date('2026-10-18T17:00:00.000Z'),
      to: new Date('2026-10-25T17:00:00.000Z'),
    });
    // 00:30 on 26 October in Vietnam: the window moved by a day.
    expect(recentDaysWindow(new Date('2026-10-25T17:30:00.000Z'), 7).from).toEqual(
      new Date('2026-10-19T17:00:00.000Z'),
    );
  });
});

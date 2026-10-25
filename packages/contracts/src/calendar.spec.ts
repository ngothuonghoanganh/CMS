import { describe, expect, it } from 'vitest';
import {
  addVnDays,
  businessDeadline,
  recentDaysWindow,
  vnDateTimeOf,
  vnDayOf,
  vnDaySpan,
  vnDayStart,
  vnDaysWindow,
  vnInstantOf,
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

describe('businessDeadline', () => {
  const vn = (text: string) => new Date(`${text}+07:00`);

  it('matches board 12: received Friday 23/10 at 10:15, answer by 27/10 and complete by 20/11', () => {
    const received = vn('2026-10-23T10:15:00');
    expect(businessDeadline(received, 2)).toEqual(vn('2026-10-27T23:59:59.999'));
    expect(businessDeadline(received, 20)).toEqual(vn('2026-11-20T23:59:59.999'));
  });

  it('counts from the day of receipt in Vietnam, whatever the hour', () => {
    expect(businessDeadline(vn('2026-10-23T23:30:00'), 2)).toEqual(vn('2026-10-27T23:59:59.999'));
    // 00:30 on Tuesday in Vietnam is still Monday in UTC: a UTC day would end a day early.
    expect(businessDeadline(vn('2026-10-27T00:30:00'), 2)).toEqual(vn('2026-10-29T23:59:59.999'));
    // 06:59 on Monday in Vietnam is Sunday in UTC: a UTC day would not count Monday as received.
    expect(businessDeadline(vn('2026-10-26T06:59:00'), 2)).toEqual(vn('2026-10-28T23:59:59.999'));
  });

  it('starts on the Monday after a request received at the weekend', () => {
    expect(businessDeadline(vn('2026-10-24T09:00:00'), 1)).toEqual(vn('2026-10-26T23:59:59.999'));
    expect(businessDeadline(vn('2026-10-25T21:00:00'), 2)).toEqual(vn('2026-10-27T23:59:59.999'));
  });

  it('runs across months and the new year', () => {
    expect(businessDeadline(vn('2026-12-30T08:00:00'), 2)).toEqual(vn('2027-01-01T23:59:59.999'));
    expect(businessDeadline(vn('2026-12-31T08:00:00'), 2)).toEqual(vn('2027-01-04T23:59:59.999'));
    expect(businessDeadline(vn('2026-12-31T08:00:00'), 20)).toEqual(vn('2027-01-28T23:59:59.999'));
  });
});

describe('vnInstantOf', () => {
  it('reads a day and a time of day in Vietnam', () => {
    expect(vnInstantOf('2026-10-23', '10:15').toISOString()).toBe('2026-10-23T03:15:00.000Z');
    expect(vnInstantOf('2027-01-01', '06:59').toISOString()).toBe('2026-12-31T23:59:00.000Z');
  });
});

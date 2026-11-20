import { describe, expect, it } from 'vitest';
import { periodEndOf, vnYearOf } from './billing-period.js';

/** An instant given as Vietnamese wall time. */
const vn = (local: string) => new Date(`${local}+07:00`);

describe('periodEndOf', () => {
  it('ends a month later on the same day and time in Vietnam', () => {
    expect(periodEndOf(vn('2026-11-21T09:30:00.000'), 'monthly')).toEqual(
      vn('2026-12-21T09:30:00.000'),
    );
    expect(periodEndOf(vn('2026-12-15T00:00:00.000'), 'monthly')).toEqual(
      vn('2027-01-15T00:00:00.000'),
    );
  });

  it('keeps the Vietnamese day near midnight, whatever the UTC day', () => {
    // 31/10 at 01:00 in Vietnam is still 30/10 in UTC.
    expect(periodEndOf(vn('2026-10-31T01:00:00.000'), 'monthly')).toEqual(
      vn('2026-11-30T01:00:00.000'),
    );
  });

  it('ends on the last day of a shorter month', () => {
    expect(periodEndOf(vn('2027-01-31T10:00:00.000'), 'monthly')).toEqual(
      vn('2027-02-28T10:00:00.000'),
    );
    expect(periodEndOf(vn('2028-01-31T10:00:00.000'), 'monthly')).toEqual(
      vn('2028-02-29T10:00:00.000'),
    );
  });

  it('ends a year later, on 28/02 for a period from 29/02', () => {
    expect(periodEndOf(vn('2026-11-21T09:30:00.000'), 'yearly')).toEqual(
      vn('2027-11-21T09:30:00.000'),
    );
    expect(periodEndOf(vn('2028-02-29T08:00:00.000'), 'yearly')).toEqual(
      vn('2029-02-28T08:00:00.000'),
    );
  });
});

describe('vnYearOf', () => {
  it('counts the year in Vietnam', () => {
    expect(vnYearOf(new Date('2026-12-31T17:00:00.000Z'))).toBe(2027);
    expect(vnYearOf(new Date('2026-12-31T16:59:59.999Z'))).toBe(2026);
  });
});

import { describe, expect, it } from 'vitest';
import {
  chartDayLabel,
  conversionRate,
  formatCount,
  isLabelledDay,
  labelEvery,
  niceTicks,
  periodLabel,
  previousLabel,
  tooltipDayLabel,
} from './analytics-presentation';

describe('numbers of board 11', () => {
  it('writes counts and rates the Vietnamese way', () => {
    expect(formatCount(3214)).toBe('3.214');
    expect(formatCount(48)).toBe('48');
    expect(conversionRate(48, 2408)).toBe('2,0%');
    expect(conversionRate(9, 402)).toBe('2,2%');
    expect(conversionRate(1, 1)).toBe('100,0%');
    expect(conversionRate(0, 0)).toBe('—');
  });

  it('compares with the same number of days just before', () => {
    expect(previousLabel('7d', 2870)).toBe('7 ngày trước: 2.870');
    expect(previousLabel('90d', 0)).toBe('90 ngày trước: 0');
  });
});

describe('days of board 11', () => {
  it('names days under the chart and in the tooltip', () => {
    expect(chartDayLabel('2026-10-18')).toBe('CN 18/10');
    expect(chartDayLabel('2026-10-24')).toBe('T7 24/10');
    expect(tooltipDayLabel('2026-10-22')).toBe('Thứ 5, 22/10');
    expect(tooltipDayLabel('2026-10-25')).toBe('Chủ nhật, 25/10');
  });

  it('writes the period, with both years across the new year', () => {
    expect(periodLabel({ from: '2026-10-18', to: '2026-10-24' })).toBe('18/10 – 24/10/2026');
    expect(periodLabel({ from: '2026-12-29', to: '2027-01-04' })).toBe('29/12/2026 – 04/01/2027');
  });

  it('labels every day of a week, and evenly spaced days counted back from today beyond', () => {
    expect(labelEvery(7)).toBe(1);
    expect(labelEvery(30)).toBe(5);
    expect(labelEvery(90)).toBe(13);
    const labelled = Array.from({ length: 30 }, (_, index) => index).filter((index) =>
      isLabelledDay(index, 30),
    );
    expect(labelled).toEqual([4, 9, 14, 19, 24, 29]);
    expect(isLabelledDay(89, 90)).toBe(true);
  });
});

describe('niceTicks', () => {
  it('covers the highest bar with clean steps, as on board 11', () => {
    expect(niceTicks(402)).toEqual([0, 150, 300, 450]);
    expect(niceTicks(1120)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(7)).toEqual([0, 3, 6, 9]);
  });

  it('never gives fractional ticks for counts, even with no visitors yet', () => {
    expect(niceTicks(2)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 1, 2, 3]);
    for (const max of [5, 13, 99, 250, 4321]) {
      const ticks = niceTicks(max);
      expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
    }
  });
});

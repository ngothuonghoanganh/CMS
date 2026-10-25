import { describe, expect, it } from 'vitest';
import { buildAnalyticsReport, type ReportInput } from './report.js';

const PAGE_A = '64b0000000000000000000a1';
const PAGE_B = '64b0000000000000000000b2';

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    period: { from: '2026-10-19', to: '2026-10-25' },
    previousPeriod: { from: '2026-10-12', to: '2026-10-18' },
    views: { daily: [], sources: [], devices: [] },
    pageVisitors: [],
    leads: { daily: [], sources: [], pages: [] },
    titles: new Map([
      [PAGE_A, 'Ưu đãi niềng răng tháng 11'],
      [PAGE_B, 'Cấy ghép Implant'],
    ]),
    onePage: false,
    ...overrides,
  };
}

describe('buildAnalyticsReport', () => {
  it('shows every day of the period, zeros included, and totals both periods', () => {
    const report = buildAnalyticsReport(
      input({
        views: {
          daily: [
            { day: '2026-10-12', views: 30, visitors: 20 },
            { day: '2026-10-22', views: 12, visitors: 9 },
            { day: '2026-10-25', views: 5, visitors: 4 },
          ],
          sources: [],
          devices: [],
        },
        leads: {
          daily: [
            { day: '2026-10-18', leads: 2 },
            { day: '2026-10-22', leads: 3 },
          ],
          sources: [],
          pages: [],
        },
      }),
    );
    expect(report.daily.map((row) => row.day)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(report.daily[3]).toEqual({ day: '2026-10-22', views: 12, visitors: 9, leads: 3 });
    expect(report.daily[0]).toEqual({ day: '2026-10-19', views: 0, visitors: 0, leads: 0 });
    expect(report.totals).toEqual({ views: 17, visitors: 13, leads: 3 });
    expect(report.previousTotals).toEqual({ views: 30, visitors: 20, leads: 2 });
  });

  it('joins the leads of each source pair to its visitors, most visitors first', () => {
    const report = buildAnalyticsReport(
      input({
        views: {
          daily: [],
          sources: [
            { source: 'google', medium: 'cpc', visitors: 410 },
            { source: 'facebook', medium: 'cpc', visitors: 1120 },
          ],
          devices: [],
        },
        leads: {
          daily: [],
          sources: [
            { source: 'facebook', medium: 'cpc', leads: 26 },
            // A lead sent without the page script: no view counted for its pair.
            { source: 'zalo', medium: 'oa', leads: 1 },
          ],
          pages: [],
        },
      }),
    );
    expect(report.sources).toEqual([
      { source: 'facebook', medium: 'cpc', visitors: 1120, leads: 26 },
      { source: 'google', medium: 'cpc', visitors: 410, leads: 0 },
      { source: 'zalo', medium: 'oa', visitors: 0, leads: 1 },
    ]);
  });

  it('shows 20 source pairs at most', () => {
    const report = buildAnalyticsReport(
      input({
        views: {
          daily: [],
          sources: Array.from({ length: 25 }, (_, index) => ({
            source: `nguon-${String(index)}`,
            medium: 'referral',
            visitors: index + 1,
          })),
          devices: [],
        },
      }),
    );
    expect(report.sources).toHaveLength(20);
    expect(report.sources[0]).toMatchObject({ source: 'nguon-24', visitors: 25 });
  });

  it('lists pages by leads, then visitors, and leaves them out for one page', () => {
    const counts = {
      pageVisitors: [
        { pageId: PAGE_A, visitors: 1400 },
        { pageId: PAGE_B, visitors: 320 },
      ],
      leads: {
        daily: [],
        sources: [],
        pages: [
          { pageId: PAGE_B, leads: 8 },
          { pageId: PAGE_A, leads: 31 },
        ],
      },
    };
    expect(buildAnalyticsReport(input(counts)).pages).toEqual([
      { page: { id: PAGE_A, title: 'Ưu đãi niềng răng tháng 11' }, visitors: 1400, leads: 31 },
      { page: { id: PAGE_B, title: 'Cấy ghép Implant' }, visitors: 320, leads: 8 },
    ]);
    expect(buildAnalyticsReport(input({ ...counts, onePage: true })).pages).toEqual([]);
  });

  it('counts visitors by device', () => {
    const report = buildAnalyticsReport(
      input({
        views: {
          daily: [],
          sources: [],
          devices: [
            { device: 'mobile', visitors: 78 },
            { device: 'desktop', visitors: 22 },
          ],
        },
      }),
    );
    expect(report.devices).toEqual({ mobile: 78, desktop: 22 });
  });
});

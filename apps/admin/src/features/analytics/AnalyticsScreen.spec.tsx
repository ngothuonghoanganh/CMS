import { type AnalyticsReport, endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AnalyticsScreen } from './AnalyticsScreen';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const LOADED_AT = Date.parse('2026-10-24T10:00:00.000Z');
const PAGE_A = '64b000000000000000000101';
const PAGE_B = '64b000000000000000000102';

const VISITORS = [280, 300, 340, 330, 402, 360, 316];
const LEADS = [5, 6, 8, 7, 9, 7, 6];

/** The week of board 11: 18/10 – 24/10/2026. */
function report(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    period: { from: '2026-10-18', to: '2026-10-24' },
    previousPeriod: { from: '2026-10-11', to: '2026-10-17' },
    totals: { views: 3214, visitors: 2408, leads: 48 },
    previousTotals: { views: 2870, visitors: 2215, leads: 39 },
    daily: VISITORS.map((visitors, index) => ({
      day: `2026-10-${String(18 + index)}`,
      views: visitors + 100,
      visitors,
      leads: LEADS[index] ?? 0,
    })),
    sources: [
      { source: 'facebook', medium: 'cpc', visitors: 1120, leads: 26 },
      { source: '(direct)', medium: '(none)', visitors: 386, leads: 5 },
      { source: '(other)', medium: '(other)', visitors: 12, leads: 0 },
    ],
    pages: [
      { page: { id: PAGE_A, title: 'Ưu đãi niềng răng tháng 11' }, visitors: 1409, leads: 31 },
      { page: { id: PAGE_B, title: 'Cấy ghép Implant' }, visitors: 320, leads: 8 },
    ],
    devices: { mobile: 1878, desktop: 530 },
    ...overrides,
  };
}

const site = siteFixture();

const pageRefs = [
  { id: PAGE_A, title: 'Ưu đãi niềng răng tháng 11' },
  { id: PAGE_B, title: 'Cấy ghép Implant' },
];

function renderScreen(initial = report()) {
  return renderWithProviders(
    <AnalyticsScreen
      site={site}
      pageRefs={pageRefs}
      initialFilters={{ range: '7d', pageId: null }}
      initialReport={initial}
      loadedAt={LOADED_AT}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  vi.setSystemTime(LOADED_AT);
  window.history.replaceState(null, '', `/sites/${site.id}/analytics`);
});

describe('AnalyticsScreen', () => {
  it('shows the four numbers of board 11 against the week before', () => {
    renderScreen();
    expect(
      screen.getByText(
        '18/10 – 24/10/2026 · không tính lượt xem bản nháp và người trong workspace',
      ),
    ).toBeInTheDocument();
    const tiles = screen.getAllByRole('term').map((term) => term.parentElement?.textContent);
    expect(tiles).toEqual([
      'Lượt xem3.2147 ngày trước: 2.870',
      'Khách duy nhất2.4087 ngày trước: 2.215',
      'Lead487 ngày trước: 39 · không tính spam',
      'Tỷ lệ chuyển đổi2,0%Lead ÷ khách duy nhất',
    ]);
  });

  it('draws a bar per day that answers the keyboard, and the same numbers as a table', async () => {
    const user = userEvent.setup();
    renderScreen();
    const chart = screen.getByRole('region', { name: 'Khách duy nhất mỗi ngày' });
    const bars = within(chart).getAllByRole('button', { name: /khách ·/ });
    expect(bars).toHaveLength(7);
    // One bar in the tab order: today's.
    expect(bars.map((bar) => bar.tabIndex)).toEqual([-1, -1, -1, -1, -1, -1, 0]);

    const today = within(chart).getByRole('button', {
      name: 'Thứ 7, 24/10: 316 khách · 6 lead · 1,9%',
    });
    today.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    const thursday = within(chart).getByRole('button', {
      name: 'Thứ 5, 22/10: 402 khách · 9 lead · 2,2%',
    });
    expect(thursday).toHaveFocus();
    expect(chart).toHaveTextContent('Thứ 5, 22/10402 khách · 9 lead · 2,2%');
    await user.keyboard('{Home}');
    expect(within(chart).getByRole('button', { name: /^Chủ nhật, 18\/10/ })).toHaveFocus();

    await user.click(within(chart).getByRole('button', { name: 'Xem dạng bảng' }));
    const rows = within(chart).getAllByRole('row');
    // Day, views, visitors, leads, rate.
    expect(
      within(rows[5] ?? chart)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['502', '402', '9', '2,2%']);
    expect(within(rows[5] ?? chart).getByRole('rowheader')).toHaveTextContent('Thứ 5, 22/10');
  });

  it('lists sources, pages and devices', () => {
    renderScreen();
    const sources = screen.getByRole('region', { name: 'Theo nguồn truy cập' });
    expect(
      within(sources)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual([
      'NGUỒN / KÊNHKHÁCHLEADTỶ LỆ',
      'facebook / cpc1.120262,3%',
      'trực tiếp38651,3%',
      'khác1200,0%',
    ]);
    const pages = screen.getByRole('region', { name: 'Theo trang' });
    expect(within(pages).getAllByRole('listitem')[0]).toHaveTextContent(
      'Ưu đãi niềng răng tháng 1131 lead · 2,2%, 1.409 khách',
    );
    const devices = screen.getByRole('region', { name: 'Thiết bị' });
    expect(
      within(devices)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Điện thoại · 78%', 'Máy tính · 22%']);
  });

  it('loads another range or one page, keeps them in the URL, and dims the old numbers meanwhile', async () => {
    const user = userEvent.setup();
    let resolve: (value: AnalyticsReport) => void = () => undefined;
    apiMock.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderScreen();

    const ranges = screen.getByRole('group', { name: 'Khoảng thời gian' });
    expect(within(ranges).getByRole('button', { name: '7 ngày' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(ranges).getByRole('button', { name: '30 ngày' }));
    expect(lastCallTo(apiMock, endpoints.analyticsReport).options).toEqual(
      expect.objectContaining({ query: { range: '30d' } }),
    );
    expect(window.location.search).toBe('?range=30d');
    expect(screen.getByText('3.214').closest('[data-refreshing]')).toHaveAttribute(
      'data-refreshing',
      'true',
    );
    resolve(report({ totals: { views: 9000, visitors: 7000, leads: 140 } }));
    expect(await screen.findByText('9.000')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Xem trang' }), PAGE_B);
    expect(lastCallTo(apiMock, endpoints.analyticsReport).options).toEqual(
      expect.objectContaining({ query: { range: '30d', pageId: PAGE_B } }),
    );
    expect(window.location.search).toBe(`?range=30d&pageId=${PAGE_B}`);
    resolve(report({ pages: [] }));
    // One page shown: no breakdown by page.
    await vi.waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Theo trang' })).toBeNull();
    });
  });

  it('says so while there are no visitors yet', () => {
    renderScreen(
      report({
        totals: { views: 0, visitors: 0, leads: 0 },
        daily: VISITORS.map((_visitors, index) => ({
          day: `2026-10-${String(18 + index)}`,
          views: 0,
          visitors: 0,
          leads: 0,
        })),
        sources: [],
        pages: [],
        devices: { mobile: 0, desktop: 0 },
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Khách duy nhất mỗi ngày' })).getByText(
        'Chưa có khách nào trong khoảng này.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('term')[3]?.parentElement).toHaveTextContent('—');
  });
});

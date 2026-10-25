import { addVnDays, type AnalyticsReport, endpoints } from '@plp/contracts';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AnalyticsScreen } from './AnalyticsScreen';
import type { AnalyticsFilters } from './filters';

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

/** `count` days up to 24/10/2026: a report of 30 or 90 days. */
function dailyOf(count: number): AnalyticsReport['daily'] {
  return Array.from({ length: count }, (_, index) => ({
    day: addVnDays('2026-10-24', index + 1 - count),
    views: 120,
    visitors: 100,
    leads: 2,
  }));
}

const site = siteFixture();

const pageRefs = [
  { id: PAGE_A, title: 'Ưu đãi niềng răng tháng 11' },
  { id: PAGE_B, title: 'Cấy ghép Implant' },
];

function screenOf(
  initial: AnalyticsReport,
  initialFilters: AnalyticsFilters = { range: '7d', pageId: null },
  loadedAt = LOADED_AT,
) {
  return (
    <AnalyticsScreen
      site={site}
      pageRefs={pageRefs}
      initialFilters={initialFilters}
      initialReport={initial}
      loadedAt={loadedAt}
    />
  );
}

function renderScreen(initial = report(), initialFilters?: AnalyticsFilters) {
  return renderWithProviders(screenOf(initial, initialFilters));
}

/** A report request that answers only when the test says so. */
function pendingReports() {
  const pending: { resolve: (value: AnalyticsReport) => void } = { resolve: () => undefined };
  apiMock.mockImplementation(
    () =>
      new Promise((done) => {
        pending.resolve = done;
      }),
  );
  return pending;
}

function chart() {
  return screen.getByRole('region', { name: 'Khách duy nhất mỗi ngày' });
}

function tile(label: string) {
  return screen.getAllByRole('term').find((term) => term.textContent === label)?.parentElement
    ?.textContent;
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

  it('keeps a day tapped by a finger or a pen, and lets a hover or a scroll go', () => {
    renderScreen();
    const bars = within(chart()).getByRole('group', { name: /^Khách duy nhất mỗi ngày/ });
    const thursday = within(chart()).getByRole('button', { name: /^Thứ 5, 22\/10/ });
    const details = 'Thứ 5, 22/10402 khách · 9 lead · 2,2%';
    const tap = (pointerType: string, pointerId: number) => {
      fireEvent.pointerEnter(thursday, { pointerType, pointerId });
      fireEvent.pointerUp(thursday, { pointerType, pointerId });
      // Lifting a finger or a pen also leaves the chart.
      fireEvent.pointerLeave(bars, { pointerType, pointerId });
    };

    tap('touch', 2);
    expect(chart()).toHaveTextContent(details);
    fireEvent.pointerLeave(bars, { pointerType: 'mouse', pointerId: 1 });
    expect(chart()).not.toHaveTextContent(details);

    tap('pen', 3);
    expect(chart()).toHaveTextContent(details);
    // A pen that taps Thursday, hovers on to Friday within the chart, then away: it tapped
    // Thursday only, so nothing stays.
    const friday = within(chart()).getByRole('button', { name: /^Thứ 6, 23\/10/ });
    const pen = { pointerType: 'pen', pointerId: 5 };
    fireEvent.pointerEnter(thursday, pen);
    fireEvent.pointerUp(thursday, pen);
    fireEvent.pointerEnter(friday, pen);
    expect(chart()).toHaveTextContent('Thứ 6, 23/10360 khách');
    fireEvent.pointerLeave(bars, pen);
    expect(chart()).not.toHaveTextContent('Thứ 6, 23/10360 khách');

    // A finger tapping Thursday, then scrolling from Friday with the same pointer id.
    tap('touch', 2);
    expect(chart()).toHaveTextContent(details);
    fireEvent.pointerEnter(friday, { pointerType: 'touch', pointerId: 2 });
    fireEvent.pointerCancel(friday, { pointerType: 'touch', pointerId: 2 });
    fireEvent.pointerLeave(bars, { pointerType: 'touch', pointerId: 2 });
    expect(chart()).not.toHaveTextContent('Thứ 6, 23/10360 khách');

    // A touch that turns into a scroll is cancelled: nothing stays over the chart.
    fireEvent.pointerEnter(thursday, { pointerType: 'touch', pointerId: 4 });
    fireEvent.pointerCancel(thursday, { pointerType: 'touch', pointerId: 4 });
    fireEvent.pointerLeave(bars, { pointerType: 'touch', pointerId: 4 });
    expect(chart()).not.toHaveTextContent(details);

    // A mouse click is no tap: moving away hides the day.
    tap('mouse', 1);
    expect(chart()).not.toHaveTextContent(details);
  });

  it('hides a tooltip opened by hover on Escape, wherever the focus is', async () => {
    const user = userEvent.setup();
    renderScreen();
    fireEvent.pointerEnter(within(chart()).getByRole('button', { name: /^Thứ 5, 22\/10/ }), {
      pointerType: 'mouse',
    });
    expect(chart()).toHaveTextContent('Thứ 5, 22/10402 khách');
    expect(document.body).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(chart()).not.toHaveTextContent('Thứ 5, 22/10402 khách');
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

  it('keeps today’s bar in the tab order when another range loads, and labels the old numbers by theirs meanwhile', async () => {
    const user = userEvent.setup();
    const pending = pendingReports();
    renderScreen(report({ period: { from: '2026-09-25', to: '2026-10-24' }, daily: dailyOf(30) }), {
      range: '30d',
      pageId: null,
    });
    const ranges = screen.getByRole('group', { name: 'Khoảng thời gian' });

    await user.click(within(ranges).getByRole('button', { name: '7 ngày' }));
    // Still the 30 days on screen, dimmed: their own range names them.
    expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(30);
    expect(tile('Lượt xem')).toBe('Lượt xem3.21430 ngày trước: 2.870');
    pending.resolve(report());
    await vi.waitFor(() => {
      expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(7);
    });
    expect(tile('Lượt xem')).toBe('Lượt xem3.2147 ngày trước: 2.870');
    const tabStops = () =>
      within(chart())
        .getAllByRole('button', { name: /khách ·/ })
        .map((bar) => bar.tabIndex);
    expect(tabStops()).toEqual([-1, -1, -1, -1, -1, -1, 0]);
    within(chart()).getByRole('button', { name: 'Xem dạng bảng' }).focus();
    await user.tab();
    expect(within(chart()).getByRole('button', { name: /^Thứ 7, 24\/10/ })).toHaveFocus();

    // Longer again: today's bar, not the seventh of ninety.
    await user.click(within(ranges).getByRole('button', { name: '90 ngày' }));
    pending.resolve(
      report({ period: { from: '2026-07-27', to: '2026-10-24' }, daily: dailyOf(90) }),
    );
    await vi.waitFor(() => {
      expect(tabStops()).toHaveLength(90);
    });
    expect(tabStops().indexOf(0)).toBe(89);
  });

  it('keeps the table view when the range changes', async () => {
    const user = userEvent.setup();
    const pending = pendingReports();
    renderScreen();
    const toggle = within(chart()).getByRole('button', { name: 'Xem dạng bảng' });
    // An action whose name says what it does, not a toggle whose name would contradict its state.
    expect(toggle).not.toHaveAttribute('aria-pressed');
    await user.click(toggle);
    expect(within(chart()).getAllByRole('row')).toHaveLength(8);

    await user.click(screen.getByRole('button', { name: '30 ngày' }));
    pending.resolve(
      report({ period: { from: '2026-09-25', to: '2026-10-24' }, daily: dailyOf(30) }),
    );
    await vi.waitFor(() => {
      expect(within(chart()).getAllByRole('row')).toHaveLength(31);
    });
    expect(within(chart()).getByRole('button', { name: 'Xem biểu đồ' })).toBeInTheDocument();
  });

  it('keeps the focus on the chart’s controls while a new report arrives', async () => {
    const user = userEvent.setup();
    const pending = pendingReports();
    renderScreen();
    const ranges = screen.getByRole('group', { name: 'Khoảng thời gian' });

    // The toggle, reached while the next range loads.
    await user.click(within(ranges).getByRole('button', { name: '30 ngày' }));
    within(chart()).getByRole('button', { name: 'Xem dạng bảng' }).focus();
    pending.resolve(
      report({ period: { from: '2026-09-25', to: '2026-10-24' }, daily: dailyOf(30) }),
    );
    await vi.waitFor(() => {
      expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(30);
    });
    expect(within(chart()).getByRole('button', { name: 'Xem dạng bảng' })).toHaveFocus();

    // A bar whose day the next report still has keeps the focus, the tab stop and its tooltip.
    await user.click(within(ranges).getByRole('button', { name: '90 ngày' }));
    // Not cached: the 30 days stay on screen while the 90 load.
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(30);
    act(() => {
      within(chart())
        .getByRole('button', { name: /^Thứ 5, 22\/10/ })
        .focus();
    });
    pending.resolve(
      report({ period: { from: '2026-07-27', to: '2026-10-24' }, daily: dailyOf(90) }),
    );
    await vi.waitFor(() => {
      expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(90);
    });
    const thursday = within(chart()).getByRole('button', { name: /^Thứ 5, 22\/10/ });
    expect(thursday).toHaveFocus();
    expect(thursday.tabIndex).toBe(0);
    expect(chart()).toHaveTextContent('Thứ 5, 22/10100 khách');
  });

  it('hands the focus to today’s bar when the next report no longer has the focused day', async () => {
    const pending = pendingReports();
    const user = userEvent.setup();
    renderScreen(report({ period: { from: '2026-07-27', to: '2026-10-24' }, daily: dailyOf(90) }), {
      range: '90d',
      pageId: null,
    });
    await user.click(screen.getByRole('button', { name: '7 ngày' }));
    act(() => {
      within(chart())
        .getByRole('button', { name: /^Thứ 2, 03\/08/ })
        .focus();
    });
    pending.resolve(report());
    await vi.waitFor(() => {
      expect(within(chart()).getByRole('button', { name: /^Thứ 7, 24\/10/ })).toHaveFocus();
    });
    expect(within(chart()).getByRole('button', { name: /^Thứ 7, 24\/10/ }).tabIndex).toBe(0);
  });

  it('leaves the focus on the page when the bar the user left is gone from the next report', async () => {
    const pending = pendingReports();
    const user = userEvent.setup();
    renderScreen(report({ period: { from: '2026-07-27', to: '2026-10-24' }, daily: dailyOf(90) }), {
      range: '90d',
      pageId: null,
    });
    await user.click(screen.getByRole('button', { name: '7 ngày' }));
    const monday = within(chart()).getByRole('button', { name: /^Thứ 2, 03\/08/ });
    act(() => {
      monday.focus();
    });
    // Safari and Firefox on macOS: clicking elsewhere leaves the focus on the page itself.
    act(() => {
      monday.blur();
    });
    pending.resolve(report());
    await vi.waitFor(() => {
      expect(within(chart()).getAllByRole('button', { name: /khách ·/ })).toHaveLength(7);
    });
    expect(document.body).toHaveFocus();
  });

  it('shows "Theo trang" for a report of every page only, not while one page’s report is still shown', async () => {
    const user = userEvent.setup();
    const pending = pendingReports();
    renderScreen(report({ pages: [] }), { range: '7d', pageId: PAGE_B });
    expect(screen.queryByRole('region', { name: 'Theo trang' })).toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Xem trang' }), '');
    expect(screen.queryByRole('region', { name: 'Theo trang' })).toBeNull();
    expect(screen.queryByText('Chưa trang nào có khách hoặc lead trong khoảng này.')).toBeNull();
    pending.resolve(report());
    expect(await screen.findByRole('region', { name: 'Theo trang' })).toHaveTextContent(
      'Ưu đãi niềng răng tháng 11',
    );
  });

  it('hides the tooltip on Escape, keeping the focus on the day', async () => {
    const user = userEvent.setup();
    renderScreen();
    const today = within(chart()).getByRole('button', { name: /^Thứ 7, 24\/10/ });
    act(() => {
      today.focus();
    });
    const details = 'Thứ 7, 24/10316 khách · 6 lead · 1,9%';
    expect(chart()).toHaveTextContent(details);
    await user.keyboard('{Escape}');
    expect(chart()).not.toHaveTextContent(details);
    expect(today).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(chart()).toHaveTextContent('Thứ 6, 23/10360 khách');
  });

  it('keeps the tooltip inside the plot: above a short bar, over the top of a tall one', () => {
    renderScreen(
      report({
        daily: VISITORS.map((visitors, index) => ({
          day: `2026-10-${String(18 + index)}`,
          views: visitors + 100,
          visitors: index === 0 ? 40 : visitors,
          leads: LEADS[index] ?? 0,
        })),
      }),
    );
    act(() => {
      within(chart())
        .getByRole('button', { name: /^Chủ nhật, 18\/10/ })
        .focus();
    });
    const low = within(chart()).getByText('40 khách · 5 lead · 12,5%');
    expect(low.style.bottom).not.toBe('');
    expect(low.style.top).toBe('');
    act(() => {
      within(chart())
        .getByRole('button', { name: /^Thứ 5, 22\/10/ })
        .focus();
    });
    const tall = within(chart()).getByText('402 khách · 9 lead · 2,2%');
    expect(tall.style.top).not.toBe('');
    expect(tall.style.bottom).toBe('');
  });

  it('shows a newer server render over the report kept from an earlier visit', async () => {
    const first = renderScreen();
    expect(tile('Lead')).toBe('Lead487 ngày trước: 39 · không tính spam');
    first.unmount();
    // Back on "Hiệu quả" seconds later: a lead was moved to spam meanwhile.
    vi.setSystemTime(LOADED_AT + 8_000);
    renderWithProviders(
      screenOf(
        report({ totals: { views: 3214, visitors: 2408, leads: 47 } }),
        { range: '7d', pageId: null },
        LOADED_AT + 8_000,
      ),
      first.queryClient,
    );
    await vi.waitFor(() => {
      expect(tile('Lead')).toBe('Lead477 ngày trước: 39 · không tính spam');
    });
    expect(apiMock).not.toHaveBeenCalled();
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

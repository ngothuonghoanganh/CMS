import {
  type ActivityListResponse,
  endpoints,
  type LeadCounts,
  type PageListResponse,
  publishingActivityTypes,
  type Site,
} from '@plp/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { Dashboard } from './Dashboard';
import type { DashboardFilters } from './filters';
import { siteQueryKeys } from './queries';
import {
  activityFixture,
  draftPageFixture,
  NO_LEADS,
  pageFixture,
  pageListFixture,
  SITE_ID,
  siteFixture,
} from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const DASHBOARD_PATH = `/sites/${SITE_ID}`;

const livePage = pageFixture();
const draftPage = draftPageFixture({ checks: { blocking: 0, warnings: 3 } });

function renderDashboard(
  {
    pages = pageListFixture([livePage, draftPage]),
    activity = { items: [activityFixture()], nextCursor: null },
    filters = { status: null, q: '' },
    leadCounts = NO_LEADS,
    site = siteFixture(),
    loadedAt = Date.now(),
  }: {
    pages?: PageListResponse;
    activity?: ActivityListResponse;
    filters?: DashboardFilters;
    leadCounts?: LeadCounts;
    site?: Site;
    loadedAt?: number;
  } = {},
  queryClient?: QueryClient,
) {
  return renderWithProviders(
    <Dashboard
      site={site}
      workspaceName="Mây Xanh Agency"
      initialFilters={filters}
      initialPages={pages}
      initialActivity={activity}
      initialLeadCounts={leadCounts}
      loadedAt={loadedAt}
    />,
    queryClient,
  );
}

/** The row of the live page, the first of the list. */
function livePageRow(): HTMLElement {
  const row = screen.getAllByRole('row')[1];
  if (row === undefined) {
    throw new Error('missing rows');
  }
  return row;
}

function filterGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Lọc theo trạng thái' });
}

// jsdom has no pointer capture; Radix menus call it while handling pointer events.
beforeAll(() => {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    if (!Reflect.has(Element.prototype, method)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: method === 'hasPointerCapture' ? () => false : () => undefined,
      });
    }
  }
});

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
  window.history.replaceState(null, '', DASHBOARD_PATH);
});

describe('Dashboard', () => {
  it('hands the focus to the first page "Xem thêm trang" brought, as it goes away', async () => {
    const user = userEvent.setup();
    renderDashboard({ pages: pageListFixture([livePage], { nextCursor: 'cursor-2' }) });
    apiMock.mockResolvedValueOnce(pageListFixture([draftPage]));

    await user.click(screen.getByRole('button', { name: 'Xem thêm trang' }));
    const added = await screen.findByRole('link', { name: 'Webinar chăm sóc răng trẻ em' });
    expect(screen.queryByRole('button', { name: 'Xem thêm trang' })).toBeNull();
    expect(added).toHaveFocus();
  });

  it('keeps the focus on "Xem thêm trang" while it stays, with more pages to come', async () => {
    const user = userEvent.setup();
    renderDashboard({ pages: pageListFixture([livePage], { nextCursor: 'cursor-2' }) });
    apiMock.mockResolvedValueOnce(pageListFixture([draftPage], { nextCursor: 'cursor-3' }));

    const more = screen.getByRole('button', { name: 'Xem thêm trang' });
    await user.click(more);
    expect(
      await screen.findByRole('link', { name: 'Webinar chăm sóc răng trẻ em' }),
    ).toBeInTheDocument();
    expect(more).toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('opens the live home page from "Xem site live", and offers nothing while no page is live', () => {
    const { unmount } = renderDashboard({
      pages: pageListFixture([livePage, draftPage], {
        liveSiteUrl: 'https://smilecare.payload.site/',
      }),
    });
    expect(screen.getByRole('link', { name: /Xem site live/ })).toHaveAttribute(
      'href',
      'https://smilecare.payload.site/?plp_internal=1',
    );
    unmount();

    renderDashboard({ pages: pageListFixture([draftPage]) });
    expect(screen.queryByRole('link', { name: /Xem site live/ })).toBeNull();
  });

  it('shows the header, the summary and the pages loaded by the server', () => {
    renderDashboard();

    expect(screen.getByText('Mây Xanh Agency / Nha khoa Smile Care')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Trang' })).toBeInTheDocument();
    // A live page of the site, opened from the admin: that browser's views are not counted
    // (ADR-019).
    expect(screen.getByRole('link', { name: /Xem site live/ })).toHaveAttribute(
      'href',
      'https://smilecare.payload.site/uu-dai-thang-11?plp_internal=1',
    );
    expect(screen.getByRole('link', { name: 'Tạo trang' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/pages/new`,
    );
    expect(screen.getByText('smilecare.payload.site')).toBeInTheDocument();
    expect(screen.getByText('Mọi trang đều ổn')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    const [, liveRow, draftRow] = rows;
    if (liveRow === undefined || draftRow === undefined) {
      throw new Error('missing rows');
    }
    expect(within(liveRow).getByText('Bản nháp trùng bản live')).toBeInTheDocument();
    expect(within(liveRow).getByText('Sẵn sàng')).toBeInTheDocument();
    expect(
      within(liveRow).getByRole('button', { name: `Tùy chọn khác cho ${livePage.title}` }),
    ).toBeInTheDocument();
    expect(within(draftRow).getByText('Chưa từng xuất bản')).toBeInTheDocument();
    expect(within(draftRow).getByText('tạo bởi Minh')).toBeInTheDocument();
    expect(within(draftRow).getByText('3 cảnh báo')).toBeInTheDocument();
    expect(within(draftRow).getByRole('link', { name: 'Sửa' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/pages/${draftPage.id}/edit`,
    );

    expect(
      screen.getByText('xuất bản v12 của “Ưu đãi niềng răng tháng 11”', { exact: false }),
    ).toBeInTheDocument();
    // Board 01 ends the activity card with a way into version history.
    expect(
      screen.getByRole('link', {
        name: /^Xem lịch sử phiên bản\s*của trang “Ưu đãi niềng răng tháng 11”$/,
      }),
    ).toHaveAttribute('href', `${DASHBOARD_PATH}/pages/64b000000000000000000101/history`);
    expect(screen.getByText('Xuất bản trang đầu tiên')).toHaveClass(/doneLabel/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('shows the leads of the last 7 days and the new ones, linking into the inbox (ADR-018)', () => {
    renderDashboard({
      pages: pageListFixture([pageFixture({ leadsLast7Days: 31 }), draftPage]),
      leadCounts: { new: { count: 12, capped: false }, last7Days: { count: 48, capped: false } },
    });

    const summary = screen.getByRole('region', { name: 'Tóm tắt site' });
    expect(within(summary).getByText('Lead 7 ngày qua')).toBeInTheDocument();
    expect(within(summary).getByText('48')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: '12 chưa xử lý' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/leads?status=new&range=all`,
    );
    expect(within(summary).getByRole('link', { name: /Mở hộp thư lead/ })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/leads`,
    );

    expect(screen.getByRole('columnheader', { name: 'LEAD 7 NGÀY' })).toBeInTheDocument();
    const [, liveRow, draftRow] = screen.getAllByRole('row');
    if (liveRow === undefined || draftRow === undefined) {
      throw new Error('missing rows');
    }
    // A live page shows its count, a page that never went live a dash.
    expect(within(liveRow).getAllByRole('cell')[4]).toHaveTextContent('31');
    expect(within(draftRow).getAllByRole('cell')[4]).toHaveTextContent('—');
  });

  it('caps the lead counts at 999+ and hides "chưa xử lý" without new leads', () => {
    renderDashboard({
      leadCounts: { new: { count: 0, capped: false }, last7Days: { count: 999, capped: true } },
    });
    const summary = screen.getByRole('region', { name: 'Tóm tắt site' });
    expect(within(summary).getByText('999+')).toBeInTheDocument();
    expect(within(summary).queryByText(/chưa xử lý/)).not.toBeInTheDocument();
  });

  it('asks only for publishing events, so uploads never push them out of the activity card', async () => {
    apiMock.mockResolvedValue({ items: [], nextCursor: null } satisfies ActivityListResponse);
    const { queryClient } = renderDashboard();

    await queryClient.invalidateQueries({ queryKey: siteQueryKeys.recentActivity(SITE_ID) });

    const call = lastCallTo(apiMock, endpoints.listActivity);
    expect(call.args).toEqual([SITE_ID]);
    expect(call.options).toHaveProperty('query', {
      limit: 5,
      types: publishingActivityTypes.join(','),
    });
    // A site that never published shows the empty state instead of "tạo site".
    await vi.waitFor(() => {
      expect(screen.getByText(/^Chưa có hoạt động nào/)).toBeInTheDocument();
    });
  });

  it('filters by status with pressed chips, a server query and the URL', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(
      pageListFixture([draftPage], { counts: pageListFixture([livePage, draftPage]).counts }),
    );
    renderDashboard();

    const all = within(filterGroup()).getByRole('button', { name: 'Tất cả · 2' });
    const drafts = within(filterGroup()).getByRole('button', { name: 'Bản nháp · 1' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(drafts).toHaveAttribute('aria-pressed', 'false');
    expect(within(filterGroup()).getByRole('button', { name: 'Live · 1' })).toBeInTheDocument();
    expect(
      within(filterGroup()).getByRole('button', { name: 'Có thay đổi · 0' }),
    ).toBeInTheDocument();
    expect(within(filterGroup()).getByRole('button', { name: 'Đã gỡ · 0' })).toBeInTheDocument();

    await user.click(drafts);

    expect(drafts).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    const call = lastCallTo(apiMock, endpoints.listPages);
    expect(call.args).toEqual([SITE_ID]);
    expect(call.options).toHaveProperty('query', { status: 'draft', limit: 50 });
    expect(call.options).toHaveProperty('signal', expect.any(AbortSignal));
    expect(window.location.search).toBe('?status=draft');
    await vi.waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    await user.click(all);
    expect(window.location.search).toBe('');
  });

  it('searches on the server after typing stops and keeps the search in the URL', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(pageListFixture([livePage]));
    renderDashboard();

    await user.type(screen.getByRole('searchbox', { name: 'Tìm trang' }), 'niềng răng');

    await vi.waitFor(() => {
      expect(apiMock).toHaveBeenCalledOnce();
    });
    expect(lastCallTo(apiMock, endpoints.listPages).options).toHaveProperty('query', {
      q: 'niềng răng',
      limit: 50,
    });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('niềng răng');
  });

  it('announces a search without results', async () => {
    const user = userEvent.setup();
    const all = pageListFixture([livePage, draftPage]);
    apiMock.mockResolvedValue(pageListFixture([], { counts: all.counts }));
    renderDashboard({ pages: all });

    await user.type(screen.getByRole('searchbox', { name: 'Tìm trang' }), 'không có');
    expect(
      await screen.findByText('Không có trang nào khớp', { selector: '[aria-live="polite"]' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Không có trang nào khớp' })).toBeVisible();
  });

  it('starts from the filters in the URL', () => {
    renderDashboard({
      filters: { status: 'live', q: 'implant' },
      pages: pageListFixture([livePage], { counts: pageListFixture([livePage, draftPage]).counts }),
    });

    expect(within(filterGroup()).getByRole('button', { name: 'Live · 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('searchbox', { name: 'Tìm trang' })).toHaveValue('implant');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('lists what needs attention with a shortcut to the page', () => {
    renderDashboard({
      pages: pageListFixture([livePage], {
        attention: {
          pagesWithChanges: 1,
          pagesWithBlockingErrors: 2,
          firstPage: { id: livePage.id, title: 'Ưu đãi niềng răng' },
        },
      }),
    });

    expect(screen.getByText('1 trang có thay đổi chưa xuất bản')).toBeInTheDocument();
    // `pagesWithBlockingErrors` counts pages, whatever their number of errors.
    expect(screen.getByText('2 trang có lỗi chặn xuất bản')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang “Ưu đãi niềng răng”' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/pages/${livePage.id}/edit`,
    );
  });

  it('lists the privacy policy and the lead destination among the setup steps of board 01', () => {
    renderDashboard();
    expect(screen.getByRole('link', { name: 'Thêm chính sách quyền riêng tư' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/privacy`,
    );
    expect(screen.getByRole('link', { name: 'Chọn nơi nhận lead (email)' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/leads?recipients=open`,
    );
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  it('ticks the setup steps the site has done', () => {
    renderDashboard({
      site: siteFixture({ privacyConfigured: true, confirmedLeadRecipients: 2 }),
    });
    expect(screen.getByText('Thêm chính sách quyền riêng tư')).toHaveClass(/doneLabel/);
    expect(screen.getByText('Chọn nơi nhận lead (email)')).toHaveClass(/doneLabel/);
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });

  it('invites to create the first page when the site has none', () => {
    renderDashboard({ pages: pageListFixture([]), activity: { items: [], nextCursor: null } });

    expect(screen.getByRole('heading', { name: 'Chưa có trang nào' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo trang đầu tiên' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/pages/new`,
    );
    expect(screen.getByRole('link', { name: 'Xuất bản trang đầu tiên' })).toHaveAttribute(
      'href',
      `${DASHBOARD_PATH}/pages/new`,
    );
    expect(screen.getByText('0/4')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('warns in the activity list when the live site may update late', () => {
    renderDashboard({
      activity: {
        items: [
          activityFixture({
            type: 'page.unpublished',
            data: {
              version: null,
              fromVersion: 12,
              toVersion: null,
              count: null,
              revalidationFailed: true,
            },
          }),
        ],
        nextCursor: null,
      },
    });

    expect(
      screen.getByText('gỡ xuất bản “Ưu đãi niềng răng tháng 11”', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trang live có thể cập nhật chậm')).toBeInTheDocument();
  });

  it('offers the page actions and unpublishes a live page through the reason dialog', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderDashboard();

    await user.click(screen.getByRole('button', { name: `Tùy chọn khác cho ${livePage.title}` }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Xem trang live',
      'SEO & chia sẻ',
      'Lịch sử phiên bản',
      'Gỡ xuất bản',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Xem trang live' }));
    expect(open).toHaveBeenCalledWith(
      `${livePage.liveUrl ?? ''}?plp_internal=1`,
      '_blank',
      'noopener,noreferrer',
    );

    await user.click(screen.getByRole('button', { name: `Tùy chọn khác cho ${livePage.title}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Lịch sử phiên bản' }));
    expect(router.push).toHaveBeenCalledWith(`${DASHBOARD_PATH}/pages/${livePage.id}/history`);

    await user.click(screen.getByRole('button', { name: `Tùy chọn khác cho ${livePage.title}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: `Gỡ xuất bản “${livePage.title}”?`,
    });
    expect(within(dialog).getByText('Nhập lý do để tiếp tục.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // The dialog itself returns focus to the row's menu button (the menu item is gone).
    expect(
      screen.getByRole('button', { name: `Tùy chọn khác cho ${livePage.title}` }),
    ).toHaveFocus();
  });

  it('does not offer unpublishing or the live page for a draft', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: `Tùy chọn khác cho ${draftPage.title}` }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'SEO & chia sẻ',
      'Lịch sử phiên bản',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'SEO & chia sẻ' }));
    expect(router.push).toHaveBeenCalledWith(`${DASHBOARD_PATH}/pages/${draftPage.id}/seo`);
  });

  describe('rendered again by the server', () => {
    const LOADED_AT = Date.parse('2026-10-24T12:00:00.000Z');
    const edited = {
      ...livePage,
      status: { kind: 'live_with_changes' as const, changeCount: 2, changes: [] },
    };

    beforeEach(() => {
      // Only the clock is fixed, so the list cached on the first visit is still fresh.
      vi.useFakeTimers({ toFake: ['Date'], now: LOADED_AT });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows the newer list and activity over what an earlier visit cached', async () => {
      const first = renderDashboard({ loadedAt: LOADED_AT });
      expect(within(livePageRow()).getByText('Bản nháp trùng bản live')).toBeInTheDocument();
      first.unmount();

      // Back from the editor seconds later: autosave refreshed no list, another member published
      // a page meanwhile, and the server rendered the dashboard again with both.
      vi.setSystemTime(LOADED_AT + 5_000);
      renderDashboard(
        {
          pages: pageListFixture([edited, draftPage]),
          activity: {
            items: [
              activityFixture({
                id: '64b000000000000000000302',
                data: {
                  version: 13,
                  fromVersion: 12,
                  toVersion: 13,
                  count: null,
                  revalidationFailed: false,
                },
              }),
              activityFixture(),
            ],
            nextCursor: null,
          },
          loadedAt: LOADED_AT + 5_000,
        },
        first.queryClient,
      );

      await vi.waitFor(() => {
        expect(within(livePageRow()).getByText('2 thay đổi chưa xuất bản')).toBeInTheDocument();
      });
      expect(
        within(filterGroup()).getByRole('button', { name: 'Có thay đổi · 1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('xuất bản v13 của “Ưu đãi niềng răng tháng 11”', { exact: false }),
      ).toBeInTheDocument();
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('keeps a list read after the server render it is given', async () => {
      const first = renderDashboard({ loadedAt: LOADED_AT });
      // The list is read again (an unpublish elsewhere on the screen refreshes it).
      vi.setSystemTime(LOADED_AT + 5_000);
      apiMock.mockResolvedValue(pageListFixture([edited, draftPage]));
      await first.queryClient.invalidateQueries({ queryKey: siteQueryKeys.pages(SITE_ID) });
      await vi.waitFor(() => {
        expect(within(livePageRow()).getByText('2 thay đổi chưa xuất bản')).toBeInTheDocument();
      });
      first.unmount();

      // The browser's back button restores the older server render.
      vi.setSystemTime(LOADED_AT + 8_000);
      renderDashboard({ loadedAt: LOADED_AT }, first.queryClient);

      expect(
        first.queryClient.getQueryData(siteQueryKeys.pageList(SITE_ID, { status: null, q: '' })),
      ).toEqual({ pages: [pageListFixture([edited, draftPage])], pageParams: [null] });
      expect(within(livePageRow()).getByText('2 thay đổi chưa xuất bản')).toBeInTheDocument();
    });
  });
});

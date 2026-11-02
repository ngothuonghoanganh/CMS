import { endpoints, type Membership } from '@plp/contracts';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { api } from '../../lib/api';
import { loadPage } from '../../lib/page-load';
import { NO_LEADS, siteFixture, SITE_ID, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { leadQueryKeys } from '../leads/queries';
import { memberQueryKeys } from '../members/queries';
import { type Leave, setScreenLeave } from './screen-leave';
import { Sidebar, type SidebarProps } from './Sidebar';
import { apiError, lastCallTo, renderWithProviders } from './test-utils';

const { router, pathname } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  pathname: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname.current,
}));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

vi.mock(import('../../lib/page-load'), () => ({ loadPage: vi.fn() }));

const apiMock = vi.mocked(api);
const loadPageMock = vi.mocked(loadPage);

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

const agency: Membership = {
  workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency', slug: 'may-xanh-agency' },
  role: 'owner',
  siteIds: null,
};
const otherWorkspace: Membership = {
  workspace: {
    id: '64b0000000000000000000a2',
    name: 'Phòng khám Gia Đình',
    slug: 'phong-kham-gia-dinh',
  },
  role: 'editor',
  siteIds: null,
};
const site = siteFixture();
const otherSite = siteFixture({
  id: '64b000000000000000000002',
  name: 'Spa Hoa Sen',
  subdomain: 'hoasen',
  themePresetId: 'sunset',
  defaultOrigin: 'https://hoasen.payload.site',
  publicOrigin: 'https://hoasen.payload.site',
});

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return renderWithProviders(
    <Sidebar
      user={{ id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' }}
      memberships={[agency, otherWorkspace]}
      membership={agency}
      site={site}
      sites={[site, otherSite]}
      pageCount={6}
      memberCount={7}
      leadCounts={NO_LEADS}
      addresses={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  loadPageMock.mockReset();
  pathname.current = `/sites/${SITE_ID}`;
  document.cookie = 'plp_ws=; Max-Age=0; Path=/';
});

describe('Sidebar', () => {
  it('shows the workspace, the site and the MVP A sections with the current one marked', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav).toHaveTextContent('Payload');
    // The switchers are named by the words they show first (WCAG 2.5.3), then what they do.
    expect(
      screen.getByRole('button', { name: 'Workspace Mây Xanh Agency, đổi workspace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Nha khoa Smile Care smilecare.payload.site, đổi site',
      }),
    ).toBeInTheDocument();

    const pages = screen.getByRole('link', { name: 'Trang 6 trang' });
    expect(pages).toHaveAttribute('href', `/sites/${SITE_ID}`);
    expect(pages).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tên miền' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Cài đặt site' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/settings`,
    );
    expect(screen.getByRole('link', { name: 'Dữ liệu & đồng ý' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/privacy`,
    );
    // Without new leads, "Leads" opens the inbox as it is and shows no badge.
    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/leads`,
    );
    expect(screen.getByRole('link', { name: 'Hiệu quả' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/analytics`,
    );
    // Words of their own, not "Ngọc AnhChủ sở hữu".
    expect(screen.getByRole('button', { name: 'Ngọc Anh Chủ sở hữu' })).toBeInTheDocument();
    // The workspace's own sections (Sidebar v2), with their counts (ADR-028).
    expect(screen.getByRole('link', { name: 'Sites 2 site' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/sites`,
    );
    expect(screen.getByRole('link', { name: 'Thành viên 7 thành viên' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/members`,
    );
    expect(screen.getByRole('link', { name: 'Vai trò & quyền' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/roles`,
    );
  });

  it('lets a role that cannot change roles ask Chủ sở hữu from the account menu (ADR-021)', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ request: null });
    const { unmount } = renderSidebar({
      membership: { ...agency, role: 'editor' },
      leadCounts: null,
    });
    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Yêu cầu đổi quyền' }));
    expect(await screen.findByRole('dialog', { name: 'Yêu cầu đổi quyền' })).toBeInTheDocument();
    unmount();

    renderSidebar();
    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    expect(screen.queryByRole('menuitem', { name: 'Yêu cầu đổi quyền' })).toBeNull();
  });

  it('shows each role only the sections it may use (ADR-020)', () => {
    const { unmount } = renderSidebar({
      membership: { ...agency, role: 'editor', siteIds: [SITE_ID, '64b000000000000000000002'] },
      memberCount: null,
      leadCounts: null,
    });
    expect(
      screen.getAllByRole('link').map((link) => link.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Sites 2 site', 'Trang 6 trang', 'Hiệu quả', 'Cài đặt site']);
    expect(screen.getByRole('button', { name: /Ngọc Anh/ })).toHaveTextContent('Biên tập · 2 site');
    unmount();

    const support = renderSidebar({
      membership: { ...agency, role: 'support', siteIds: [SITE_ID] },
      sites: [site],
      memberCount: null,
    });
    expect(
      screen.getAllByRole('link').map((link) => link.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Sites 1 site', 'Trang 6 trang', 'Leads', 'Hiệu quả']);
    support.unmount();

    // A custom role answering data requests finds them under "Dữ liệu & đồng ý" (ADR-024).
    renderSidebar({
      membership: {
        ...agency,
        role: {
          customRoleId: '64b0000000000000000000c1',
          name: 'Pháp chế',
          permissions: ['pages.view', 'leads.view', 'personalData.manage'],
        },
      },
      memberCount: null,
    });
    expect(
      screen.getAllByRole('link').map((link) => link.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Sites 2 site', 'Trang 6 trang', 'Leads', 'Hiệu quả', 'Dữ liệu & đồng ý']);
  });

  it('offers a first site on a workspace screen of a workspace without one', () => {
    const { unmount } = renderSidebar({ site: null, sites: [], pageCount: 0 });
    expect(screen.getByRole('link', { name: 'Tạo site mới' })).toHaveAttribute(
      'href',
      `/sites/new?workspace=${WORKSPACE_ID}`,
    );
    expect(screen.queryByRole('link', { name: /Trang/ })).not.toBeInTheDocument();
    unmount();

    renderSidebar({
      membership: { ...agency, role: 'viewer' },
      site: null,
      sites: [],
      pageCount: 0,
      memberCount: null,
      leadCounts: null,
    });
    expect(screen.getByText('Bạn chưa được giao site nào.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vai trò & quyền' })).not.toBeInTheDocument();
    // "Sites" still explains, on its own screen, why there is none (ADR-028).
    expect(screen.getByRole('link', { name: 'Sites 0 site' })).toBeInTheDocument();
  });

  it('puts "Sites" first in WORKSPACE for every role, marked on its screen (ADR-028)', () => {
    pathname.current = `/workspaces/${WORKSPACE_ID}/sites`;
    const { unmount } = renderSidebar();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      'Sites 2 site',
      'Thành viên 7 thành viên',
      'Vai trò & quyền',
      'Trang 6 trang',
      'Leads',
      'Hiệu quả',
      'Tên miền',
      'Dữ liệu & đồng ý',
      'Cài đặt site',
    ]);
    expect(screen.getByRole('link', { name: 'Sites 2 site' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Trang 6 trang' })).not.toHaveAttribute('aria-current');
    unmount();

    renderSidebar({
      membership: { ...agency, role: 'viewer' },
      memberCount: null,
      leadCounts: null,
    });
    expect(screen.getByRole('link', { name: 'Sites 2 site' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Thành viên/ })).not.toBeInTheDocument();
  });

  it('counts the members again after a change on "Thành viên" (ADR-028)', async () => {
    apiMock.mockResolvedValue({ counts: {}, members: 8 });
    const { queryClient } = renderSidebar();
    expect(screen.getByRole('link', { name: 'Thành viên 7 thành viên' })).toBeInTheDocument();
    // The members screen invalidates every query of the workspace's people after a change.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: memberQueryKeys.all(WORKSPACE_ID) });
    });
    expect(
      await screen.findByRole('link', { name: 'Thành viên 8 thành viên' }),
    ).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.roleCounts).args).toEqual([WORKSPACE_ID]);
  });

  it('marks "Tên miền" on the domain page', () => {
    pathname.current = `/sites/${SITE_ID}/domain`;
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Tên miền' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trang 6 trang' })).not.toHaveAttribute('aria-current');
  });

  it('shows the new leads of every time and opens exactly those (ADR-018)', () => {
    renderSidebar({
      leadCounts: { new: { count: 12, capped: false }, last7Days: { count: 48, capped: false } },
    });
    const leads = screen.getByRole('link', { name: 'Leads 12 mới' });
    expect(leads).toHaveAttribute('href', `/sites/${SITE_ID}/leads?status=new&range=all`);
  });

  it('caps the badge at 999+', () => {
    renderSidebar({
      leadCounts: { new: { count: 999, capped: true }, last7Days: { count: 999, capped: true } },
    });
    expect(screen.getByRole('link', { name: 'Leads 999+ mới' })).toBeInTheDocument();
  });

  it('marks "Leads" in the inbox', () => {
    pathname.current = `/sites/${SITE_ID}/leads`;
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks "Dữ liệu & đồng ý" on the privacy page', () => {
    pathname.current = `/sites/${SITE_ID}/privacy`;
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Dữ liệu & đồng ý' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('switches site and offers site creation to owners', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /đổi site$/ }));
    expect(screen.getByRole('menuitemradio', { name: /Nha khoa Smile Care/ })).toBeChecked();
    expect(screen.getByRole('menuitem', { name: 'Tạo site mới' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: /Spa Hoa Sen/ }));

    expect(router.push).toHaveBeenCalledWith('/sites/64b000000000000000000002');
  });

  it('opens site creation in the current workspace', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /đổi site$/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Tạo site mới' }));

    expect(router.push).toHaveBeenCalledWith(`/sites/new?workspace=${WORKSPACE_ID}`);
  });

  it('hides site creation from editors', async () => {
    const user = userEvent.setup();
    renderSidebar({ membership: { ...agency, role: 'editor' } });

    expect(screen.getByRole('button', { name: /Ngọc Anh/ })).toHaveTextContent('Biên tập');
    await user.click(screen.getByRole('button', { name: /đổi site$/ }));
    expect(screen.queryByRole('menuitem', { name: 'Tạo site mới' })).not.toBeInTheDocument();
  });

  it('remembers the chosen workspace and opens it with a full page load', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Phòng khám Gia Đình' }));

    expect(document.cookie).toContain('plp_ws=64b0000000000000000000a2');
    // Nothing of this workspace's sites (leads, "N mới") stays in memory after a page load.
    expect(loadPageMock).toHaveBeenCalledWith('/');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('leaves the screen on display alone until the page unloads', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderSidebar();
    // "N mới" and the inbox of a site of this workspace, which the screen on display shows.
    queryClient.setQueryData(leadQueryKeys.counts(site.id), {
      ...NO_LEADS,
      new: { count: 4, capped: false },
    });
    queryClient.setQueryData(leadQueryKeys.lists(site.id), { items: [] });

    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Phòng khám Gia Đình' }));

    // Clearing the cache here would make the mounted queries refetch this workspace's data.
    expect(loadPageMock).toHaveBeenCalledWith('/');
    expect(queryClient.getQueryData(leadQueryKeys.counts(site.id))).toMatchObject({
      new: { count: 4 },
    });
    expect(queryClient.getQueryData(leadQueryKeys.lists(site.id))).toEqual({ items: [] });
    expect(screen.getByRole('link', { name: 'Leads 4 mới' })).toBeInTheDocument();
  });

  it('opens another workspace at its own address when workspaces have addresses (ADR-025)', async () => {
    const user = userEvent.setup();
    document.cookie = 'plp_ws=; Max-Age=0; Path=/';
    renderSidebar({
      addresses: {
        template: 'https://{slug}.app.example.vn',
        commonOrigin: 'https://app.example.vn',
      },
    });

    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    const other = screen.getByRole('menuitemradio', { name: /Phòng khám Gia Đình/ });
    expect(other).toHaveTextContent('phong-kham-gia-dinh.app.example.vn');
    await user.click(other);

    expect(loadPageMock).toHaveBeenCalledWith('https://phong-kham-gia-dinh.app.example.vn/');
    // The address says which workspace opens; no preference is kept.
    expect(document.cookie).not.toContain('plp_ws=64b0000000000000000000a2');
  });

  it('lists every workspace at the common address from the switcher (ADR-025)', async () => {
    const user = userEvent.setup();
    renderSidebar({
      addresses: {
        template: 'https://{slug}.app.example.vn',
        commonOrigin: 'https://app.example.vn',
      },
    });

    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    expect(screen.getByText('Workspace của bạn')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Xem tất cả workspace' }));

    expect(loadPageMock).toHaveBeenCalledWith('https://app.example.vn/');
  });

  it('lists no other workspaces to someone who has one', async () => {
    const user = userEvent.setup();
    renderSidebar({
      memberships: [agency],
      addresses: {
        template: 'https://{slug}.app.example.vn',
        commonOrigin: 'https://app.example.vn',
      },
    });
    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    expect(screen.queryByRole('menuitem', { name: 'Xem tất cả workspace' })).toBeNull();
  });

  it('keeps the one-address switcher as it was', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    expect(screen.queryByRole('menuitem', { name: 'Xem tất cả workspace' })).toBeNull();
    expect(screen.queryByText('Workspace của bạn')).toBeNull();
  });

  it('stays when the current workspace is chosen again', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Mây Xanh Agency' }));

    expect(loadPageMock).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('plp_ws=');
  });

  it('keeps the cached data of the workspace when only the site changes', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderSidebar();
    queryClient.setQueryData(leadQueryKeys.counts(otherSite.id), {
      ...NO_LEADS,
      new: { count: 4, capped: false },
    });

    await user.click(screen.getByRole('button', { name: /đổi site$/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Spa Hoa Sen/ }));

    expect(queryClient.getQueryData(leadQueryKeys.counts(otherSite.id))).toMatchObject({
      new: { count: 4 },
    });
  });

  it('opens the account page from the account menu (ADR-026)', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Cài đặt tài khoản' }));

    expect(router.push).toHaveBeenCalledWith('/account');
  });

  it('signs out and opens the login page', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(undefined);
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    expect(apiMock).toHaveBeenCalledWith(endpoints.logout, []);
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login');
    });
  });

  it('tells the user when signing out failed', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    expect(await screen.findByText('Chưa đăng xuất được')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the login page when the session had already ended', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(apiError(401, 'unauthenticated', 'Phiên đăng nhập đã hết hạn'));
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByText('Chưa đăng xuất được')).toBeNull();
  });

  describe('over a screen holding changes not saved yet', () => {
    /** The screen on display: it lets the user leave only when the test says it saved. */
    function holdingScreen() {
      const asked: Array<{ leave: Leave; discardLabel: string }> = [];
      const remove = setScreenLeave((leave, { discardLabel }) => {
        asked.push({ leave, discardLabel });
      });
      onTestFinished(remove);
      return asked;
    }

    it('switches site once the screen saved', async () => {
      const user = userEvent.setup();
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /đổi site$/ }));
      await user.click(screen.getByRole('menuitemradio', { name: /Spa Hoa Sen/ }));

      expect(router.push).not.toHaveBeenCalled();
      expect(asked).toHaveLength(1);
      expect(asked[0]?.leave()).toBe('leaving');
      expect(router.push).toHaveBeenCalledWith('/sites/64b000000000000000000002');
    });

    it('opens site creation once the screen saved', async () => {
      const user = userEvent.setup();
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /đổi site$/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Tạo site mới' }));

      expect(router.push).not.toHaveBeenCalled();
      expect(asked[0]?.leave()).toBe('leaving');
      expect(router.push).toHaveBeenCalledWith(`/sites/new?workspace=${WORKSPACE_ID}`);
    });

    it('remembers another workspace only when the user really leaves', async () => {
      const user = userEvent.setup();
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Phòng khám Gia Đình' }));

      // The save may fail and the user stay: this workspace is still the one they work in.
      expect(document.cookie).not.toContain('plp_ws=');
      expect(loadPageMock).not.toHaveBeenCalled();
      expect(asked[0]?.leave()).toBe('leaving');
      expect(document.cookie).toContain('plp_ws=64b0000000000000000000a2');
      expect(loadPageMock).toHaveBeenCalledWith('/');
    });

    it('ends the session only after the screen saved, offering to sign out without the change', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValueOnce(undefined);
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

      expect(apiMock).not.toHaveBeenCalled();
      expect(asked[0]?.discardLabel).toBe('Đăng xuất, bỏ thay đổi');
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });
      expect(outcome).toBe('leaving');
      expect(router.replace).toHaveBeenCalledWith('/login');
      expect(apiMock).toHaveBeenCalledWith(endpoints.logout, []);
    });

    it('reports that the user stays when signing out fails', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });

      // The screen that let this leave go without saving saves and asks again.
      expect(outcome).toBe('stayed');
      expect(await screen.findByText('Chưa đăng xuất được')).toBeInTheDocument();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('opens the login page with a page load when the router cannot, and reports a leave', async () => {
      const user = userEvent.setup();
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onTestFinished(() => {
        logged.mockRestore();
      });
      apiMock.mockResolvedValueOnce(undefined);
      const broken = new Error('The router is not mounted');
      router.replace.mockImplementationOnce(() => {
        throw broken;
      });
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });

      // The session is gone: the screen must not save or ask as if the user stayed.
      expect(outcome).toBe('leaving');
      expect(apiMock).toHaveBeenCalledWith(endpoints.logout, []);
      expect(loadPageMock).toHaveBeenCalledWith('/login');
      expect(logged).toHaveBeenCalledWith(
        'Opening the login page after signing out failed',
        broken,
      );
      expect(screen.queryByText('Chưa đăng xuất được')).toBeNull();
    });

    it('tells the user to reload, and stays, when not even a page load opens the login page', async () => {
      const user = userEvent.setup();
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onTestFinished(() => {
        logged.mockRestore();
      });
      apiMock.mockResolvedValueOnce(undefined);
      router.replace.mockImplementationOnce(() => {
        throw new Error('The router is not mounted');
      });
      const blocked = new Error('Navigation was blocked');
      loadPageMock.mockImplementationOnce(() => {
        throw blocked;
      });
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });

      // Still on the screen: it saves and asks again before the tab closes. The session is gone,
      // and the user learns it, with what to do.
      expect(outcome).toBe('stayed');
      expect(logged).toHaveBeenCalledWith(
        'Loading the login page after signing out failed',
        blocked,
      );
      const told = await screen.findByText('Bạn đã đăng xuất');
      expect(told.closest('[data-tone]')).toHaveAttribute('data-tone', 'danger');
      expect(
        screen.getByText('Không mở được trang đăng nhập. Hãy tải lại trang.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Chưa đăng xuất được')).toBeNull();
    });

    it('still opens the login page when dropping the cached data fails', async () => {
      const user = userEvent.setup();
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onTestFinished(() => {
        logged.mockRestore();
      });
      apiMock.mockResolvedValueOnce(undefined);
      const asked = holdingScreen();
      const { queryClient } = renderSidebar();
      const broken = new Error('A cache listener threw');
      vi.spyOn(queryClient, 'clear').mockImplementation(() => {
        throw broken;
      });

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });

      expect(outcome).toBe('leaving');
      expect(router.replace).toHaveBeenCalledWith('/login');
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledWith('Dropping cached data after signing out failed', broken);
      expect(screen.queryByText('Chưa đăng xuất được')).toBeNull();
    });

    it('reports a leave when the session had already ended', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValueOnce(apiError(401, 'unauthenticated', 'Phiên đăng nhập đã hết hạn'));
      const asked = holdingScreen();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      let outcome: unknown;
      await act(async () => {
        outcome = await asked[0]?.leave();
      });

      expect(outcome).toBe('leaving');
      expect(router.replace).toHaveBeenCalledWith('/login');
    });
  });
});

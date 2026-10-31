import { endpoints, type Membership } from '@plp/contracts';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { api } from '../../lib/api';
import { loadPage } from '../../lib/page-load';
import { NO_LEADS, siteFixture, SITE_ID, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { leadQueryKeys } from '../leads/queries';
import { type Leave, setScreenLeave } from './screen-leave';
import { Sidebar, type SidebarProps } from './Sidebar';
import { apiError, renderWithProviders } from './test-utils';

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
  workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency' },
  role: 'owner',
};
const otherWorkspace: Membership = {
  workspace: { id: '64b0000000000000000000a2', name: 'Phòng khám Gia Đình' },
  role: 'editor',
};
const site = siteFixture();
const otherSite = siteFixture({
  id: '64b000000000000000000002',
  name: 'Spa Hoa Sen',
  subdomain: 'hoasen',
  themePresetId: 'sunset',
  defaultOrigin: 'https://hoasen.payload.site',
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
      leadCounts={NO_LEADS}
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
    // Words of their own, not "Ngọc AnhOwner".
    expect(screen.getByRole('button', { name: 'Ngọc Anh Owner' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /Ngọc Anh/ })).toHaveTextContent('Editor');
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

    it('reports that the user stays when not even a page load opens the login page', async () => {
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

      // Still on the screen: it saves and asks again before the tab closes.
      expect(outcome).toBe('stayed');
      expect(logged).toHaveBeenCalledWith(
        'Loading the login page after signing out failed',
        blocked,
      );
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

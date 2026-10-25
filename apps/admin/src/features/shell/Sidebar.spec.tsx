import { endpoints, type Membership } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture, SITE_ID, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { Sidebar, type SidebarProps } from './Sidebar';
import { renderWithProviders } from './test-utils';

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

const apiMock = vi.mocked(api);

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
      {...overrides}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  pathname.current = `/sites/${SITE_ID}`;
  document.cookie = 'plp_ws=; Max-Age=0; Path=/';
});

describe('Sidebar', () => {
  it('shows the workspace, the site and the MVP A sections with the current one marked', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav).toHaveTextContent('Payload');
    expect(
      screen.getByRole('button', { name: 'Đổi workspace — hiện tại: Mây Xanh Agency' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Đổi site — hiện tại: Nha khoa Smile Care' }),
    ).toHaveTextContent('smilecare.payload.site');

    const pages = screen.getByRole('link', { name: 'Trang 6 trang' });
    expect(pages).toHaveAttribute('href', `/sites/${SITE_ID}`);
    expect(pages).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tên miền' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Cài đặt site' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/settings`,
    );
    expect(screen.queryByRole('link', { name: /Leads|Hiệu quả|Dữ liệu/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ngọc Anh/ })).toHaveTextContent('Owner');
  });

  it('marks "Tên miền" on the domain page', () => {
    pathname.current = `/sites/${SITE_ID}/domain`;
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Tên miền' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trang 6 trang' })).not.toHaveAttribute('aria-current');
  });

  it('switches site and offers site creation to owners', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Đổi site/ }));
    expect(screen.getByRole('menuitemradio', { name: /Nha khoa Smile Care/ })).toBeChecked();
    expect(screen.getByRole('menuitem', { name: 'Tạo site mới' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: /Spa Hoa Sen/ }));

    expect(router.push).toHaveBeenCalledWith('/sites/64b000000000000000000002');
  });

  it('opens site creation in the current workspace', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Đổi site/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Tạo site mới' }));

    expect(router.push).toHaveBeenCalledWith(`/sites/new?workspace=${WORKSPACE_ID}`);
  });

  it('hides site creation from editors', async () => {
    const user = userEvent.setup();
    renderSidebar({ membership: { ...agency, role: 'editor' } });

    expect(screen.getByRole('button', { name: /Ngọc Anh/ })).toHaveTextContent('Editor');
    await user.click(screen.getByRole('button', { name: /Đổi site/ }));
    expect(screen.queryByRole('menuitem', { name: 'Tạo site mới' })).not.toBeInTheDocument();
  });

  it('remembers the chosen workspace and opens it', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /Đổi workspace/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Phòng khám Gia Đình' }));

    expect(document.cookie).toContain('plp_ws=64b0000000000000000000a2');
    expect(router.push).toHaveBeenCalledWith('/');
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
});

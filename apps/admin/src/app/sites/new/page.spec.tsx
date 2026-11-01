import { endpoints, type Membership } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAddress } from '../../../features/shell/admin-address';
import { renderWithProviders } from '../../../features/shell/test-utils';
import { loadPage } from '../../../lib/page-load';
import NewSitePage from './page';

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect ${href}`);
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));

let address: AdminAddress = { kind: 'single' };
vi.mock('../../../features/shell/current-address', () => ({
  currentAddress: () => Promise.resolve(address),
  requireWorkspaceAddress: () => Promise.resolve(),
}));

const kitchen: Membership = {
  workspace: { id: '64b0000000000000000000b2', name: 'Bếp Nhà Lá', slug: 'bep-nha-la' },
  role: 'owner',
  siteIds: null,
};
let memberships: Membership[] = [];
const viewer: Membership = {
  workspace: { id: '64b0000000000000000000a1', name: 'Mây Xanh Agency', slug: 'may-xanh' },
  role: 'viewer',
  siteIds: null,
};
vi.mock('../../../lib/server-api', () => ({
  requireMe: () =>
    Promise.resolve({
      user: { id: 'u', name: 'Thu Hà', email: 'thuha@mayxanh.vn' },
      memberships,
    }),
  serverApi: (endpoint: unknown) =>
    endpoint === endpoints.listSites
      ? Promise.resolve({ items: [] })
      : Promise.reject(new Error('unexpected call')),
}));

const query = () => Promise.resolve({ workspace: viewer.workspace.id });

vi.mock(import('../../../lib/page-load'), () => ({ loadPage: vi.fn() }));

beforeEach(() => {
  address = { kind: 'single' };
  memberships = [viewer];
  vi.mocked(loadPage).mockReset();
});

describe('site creation for a member who may not create sites', () => {
  it('leads to the other workspaces and out, when the workspace has no site yet (ADR-025)', async () => {
    memberships = [viewer, kitchen];
    address = {
      kind: 'workspace',
      slug: 'may-xanh',
      addresses: {
        template: 'https://{slug}.app.example.vn',
        commonOrigin: 'https://app.example.vn',
      },
    };
    renderWithProviders(await NewSitePage({ searchParams: query() }));

    expect(screen.getByText(/được tạo site mới/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tất cả workspace' })).toHaveAttribute(
      'href',
      'https://app.example.vn/',
    );
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('still lets them sign out at the one address', async () => {
    renderWithProviders(await NewSitePage({ searchParams: query() }));
    expect(screen.queryByRole('link', { name: 'Xem tất cả workspace' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('opens their other workspaces at the one address', async () => {
    const user = userEvent.setup();
    memberships = [viewer, kitchen];
    renderWithProviders(await NewSitePage({ searchParams: query() }));

    await user.click(screen.getByRole('button', { name: 'Mở Bếp Nhà Lá' }));
    expect(document.cookie).toContain(`plp_ws=${kitchen.workspace.id}`);
    expect(loadPage).toHaveBeenCalledWith('/');
  });

  it('offers the common address only when there are other workspaces to see there', async () => {
    address = {
      kind: 'workspace',
      slug: 'may-xanh',
      addresses: {
        template: 'https://{slug}.app.example.vn',
        commonOrigin: 'https://app.example.vn',
      },
    };
    memberships = [viewer];
    renderWithProviders(await NewSitePage({ searchParams: query() }));
    // With one workspace, the common address would only open this page again.
    expect(screen.queryByRole('link', { name: 'Xem tất cả workspace' })).toBeNull();
  });
});

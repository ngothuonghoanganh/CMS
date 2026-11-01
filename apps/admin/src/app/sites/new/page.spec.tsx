import { endpoints, type Membership } from '@plp/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAddress } from '../../../features/shell/admin-address';
import { renderWithProviders } from '../../../features/shell/test-utils';
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

const viewer: Membership = {
  workspace: { id: '64b0000000000000000000a1', name: 'Mây Xanh Agency', slug: 'may-xanh' },
  role: 'viewer',
  siteIds: null,
};
vi.mock('../../../lib/server-api', () => ({
  requireMe: () =>
    Promise.resolve({
      user: { id: 'u', name: 'Thu Hà', email: 'thuha@mayxanh.vn' },
      memberships: [viewer],
    }),
  serverApi: (endpoint: unknown) =>
    endpoint === endpoints.listSites
      ? Promise.resolve({ items: [] })
      : Promise.reject(new Error('unexpected call')),
}));

const query = () => Promise.resolve({ workspace: viewer.workspace.id });

beforeEach(() => {
  address = { kind: 'single' };
});

describe('site creation for a member who may not create sites', () => {
  it('leads to the other workspaces and out, when the workspace has no site yet (ADR-025)', async () => {
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
});

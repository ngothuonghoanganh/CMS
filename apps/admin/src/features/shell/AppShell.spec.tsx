import type { Membership } from '@plp/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NO_LEADS, siteFixture, SITE_ID, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { AppShell } from './AppShell';
import { createTestQueryClient } from './test-utils';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => `/sites/${SITE_ID}/domain`,
}));

beforeAll(() => {
  // jsdom has no media queries; the shell listens for the wide layout to close the drawer.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

function renderShell() {
  const membership: Membership = {
    workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency' },
    role: 'owner',
  };
  const site = siteFixture();
  // AppShell brings its own ToastProvider.
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AppShell
        user={{ id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' }}
        memberships={[membership]}
        membership={membership}
        site={site}
        sites={[site]}
        pageCount={2}
        leadCounts={NO_LEADS}
      >
        <h1>Tên miền</h1>
      </AppShell>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('puts the page in the main landmark with a skip link', () => {
    renderShell();

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Tên miền' }),
    );
    expect(screen.getByRole('link', { name: 'Bỏ qua điều hướng' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens the navigation in a drawer and closes it after choosing a section', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu điều hướng' });
    const nav = within(drawer).getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Tên miền' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(nav).getByRole('link', { name: 'Cài đặt site' }));
    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument();
  });

  it('closes the drawer with its close button', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
    await user.click(screen.getByRole('button', { name: 'Đóng menu điều hướng' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở menu điều hướng' })).toHaveFocus();
  });
});

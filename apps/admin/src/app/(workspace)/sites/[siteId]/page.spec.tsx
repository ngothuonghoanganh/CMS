import { endpoints, type Membership, type PageListResponse } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  draftPageFixture,
  NO_LEADS,
  pageFixture,
  pageListFixture,
  SITE_ID,
  siteFixture,
  WORKSPACE_ID,
} from '../../../../features/dashboard/test-fixtures';
import { loadDashboardData } from '../../../../features/dashboard/load-dashboard';
import { createTestQueryClient, lastCallTo } from '../../../../features/shell/test-utils';
import { api } from '../../../../lib/api';
import DashboardPage from './page';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const OTHER_SITE_ID = '64b000000000000000000002';
const membership: Membership = {
  workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency', slug: 'may-xanh-agency' },
  role: 'owner',
  siteIds: null,
};
vi.mock('../../../../features/shell/site-context', () => ({
  loadSiteContext: (siteId: string) =>
    Promise.resolve({
      site: siteFixture({
        id: siteId,
        name: siteId === SITE_ID ? 'Nha khoa Smile Care' : 'Spa Lá Xanh',
      }),
      membership,
      leadCounts: NO_LEADS,
    }),
}));
vi.mock(import('../../../../features/dashboard/load-dashboard'), () => ({
  loadDashboardData: vi.fn(),
}));
vi.mock(import('../../../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const LOADED_AT = Date.parse('2026-10-24T12:00:00.000Z');
const livePage = pageFixture();
const draftPage = draftPageFixture();
const counts = pageListFixture([livePage, draftPage]).counts;
/** The first page of the list; "Xem thêm trang" brings the draft. */
const firstPage = pageListFixture([livePage], { nextCursor: 'cursor-2', counts });
const secondPage = pageListFixture([draftPage], { counts });

function listFor(query: { status?: string; q?: string; cursor?: string }): PageListResponse {
  if (query.cursor === 'cursor-2') {
    return secondPage;
  }
  return query.status === undefined && query.q === undefined
    ? firstPage
    : pageListFixture([draftPage], { counts });
}

/**
 * The route rendered on the server for `searchParams`. A refresh renders the URL the router
 * holds, which the screen keeps in step with its filters: the current one by default.
 */
function serverRender(
  siteId = SITE_ID,
  searchParams: Record<string, string> = Object.fromEntries(
    new URLSearchParams(window.location.search),
  ),
): Promise<ReactElement> {
  return DashboardPage({
    params: Promise.resolve({ siteId }),
    searchParams: Promise.resolve(searchParams),
  });
}

function renderRoute(element: ReactElement) {
  const queryClient = createTestQueryClient();
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(element, { wrapper: Providers });
}

function filterButton(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Lọc theo trạng thái' })).getByRole('button', {
    name,
  });
}

beforeEach(() => {
  // Only the clock is fixed: each server render is dated after what the screen read before it.
  vi.useFakeTimers({ toFake: ['Date'], now: LOADED_AT });
  window.history.replaceState(null, '', `/sites/${SITE_ID}`);
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.listPages) {
      const query = (options as { query: Parameters<typeof listFor>[0] }).query;
      return Promise.resolve(listFor(query));
    }
    return Promise.reject(new Error('unexpected call'));
  });
  vi.mocked(loadDashboardData).mockImplementation((_siteId, filters) =>
    Promise.resolve({
      pages: listFor({
        ...(filters.status === null ? {} : { status: filters.status }),
        ...(filters.q === '' ? {} : { q: filters.q }),
      }),
      activity: { items: [], nextCursor: null },
      address: { primaryStatus: null, customDomainActive: false },
      loadedAt: Date.now(),
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard route', () => {
  it('keeps the screen through a refresh: the focus, the search being typed and the pages loaded', async () => {
    const user = userEvent.setup();
    const view = renderRoute(await serverRender());
    await user.click(screen.getByRole('button', { name: 'Xem thêm trang' }));
    expect(await screen.findByRole('link', { name: draftPage.title })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Tìm trang' });
    await user.type(search, 'webinar');

    // "Xóa trang" refreshes the route for the sidebar's "Trang N", before the search is sent.
    vi.setSystemTime(LOADED_AT + 5_000);
    view.rerender(await serverRender());

    expect(screen.getByRole('searchbox', { name: 'Tìm trang' })).toBe(search);
    expect(search).toHaveFocus();
    expect(search).toHaveValue('webinar');
    expect(screen.getByRole('link', { name: livePage.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: draftPage.title })).toBeInTheDocument();
    // The search goes on once typing stops.
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listPages).options).toHaveProperty('query', {
        q: 'webinar',
        limit: 50,
      });
    });
  });

  it('keeps the filters a refresh renders, as the screen wrote them into the URL', async () => {
    const user = userEvent.setup();
    const view = renderRoute(await serverRender());
    await user.click(filterButton('Bản nháp · 1'));
    expect(window.location.search).toBe('?status=draft');
    const search = screen.getByRole('searchbox', { name: 'Tìm trang' });
    await user.type(search, 'webinar');

    vi.setSystemTime(LOADED_AT + 5_000);
    view.rerender(await serverRender());

    expect(filterButton('Bản nháp · 1')).toHaveAttribute('aria-pressed', 'true');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('webinar');
  });

  it('starts again from the filters of a navigation, such as the sidebar’s "Trang"', async () => {
    const user = userEvent.setup();
    const view = renderRoute(await serverRender());
    await user.click(filterButton('Bản nháp · 1'));
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trang' }), 'webinar');

    vi.setSystemTime(LOADED_AT + 5_000);
    view.rerender(await serverRender(SITE_ID, {}));

    expect(filterButton('Tất cả · 2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: 'Tìm trang' })).toHaveValue('');
    expect(window.location.search).toBe('');
    expect(screen.getByRole('link', { name: livePage.title })).toBeInTheDocument();
  });

  it('starts over for another site', async () => {
    const user = userEvent.setup();
    const view = renderRoute(await serverRender());
    await user.click(filterButton('Bản nháp · 1'));

    vi.setSystemTime(LOADED_AT + 5_000);
    window.history.replaceState(null, '', `/sites/${OTHER_SITE_ID}`);
    view.rerender(await serverRender(OTHER_SITE_ID));

    expect(screen.getByText('Mây Xanh Agency / Spa Lá Xanh')).toBeInTheDocument();
    expect(filterButton('Tất cả · 2')).toHaveAttribute('aria-pressed', 'true');
  });
});

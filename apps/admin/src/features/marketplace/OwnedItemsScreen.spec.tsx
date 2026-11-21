import { type Access, endpoints, type Membership } from '@plp/contracts';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { templateQueryKeys } from '../templates/queries';
import { licenceFixture, ownedItemFixture } from './test-fixtures';
import { OwnedItemsScreen } from './OwnedItemsScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};
const smile = siteFixture();

const bought = ownedItemFixture({
  itemId: 'mp-khai-truong-phong-tap',
  name: 'Khai trương phòng tập',
  source: 'purchase',
  version: 1,
  latestVersion: 2,
  newVersions: [{ version: 2, releasedOn: '2026-12-01', note: 'Thêm section lịch lớp học.' }],
  usedCount: 2,
  grantedAt: '2026-09-02T03:00:00.000Z',
});
const free = ownedItemFixture({ grantedAt: '2026-08-15T03:00:00.000Z' });

function renderScreen(
  options: {
    role?: Access;
    items?: ReturnType<typeof ownedItemFixture>[];
    sites?: (typeof smile)[];
  } = {},
) {
  return renderWithProviders(
    <OwnedItemsScreen
      workspace={workspace}
      role={options.role ?? 'owner'}
      items={options.items ?? [bought, free]}
      sites={options.sites ?? [smile]}
      initialSiteId={SITE_ID}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.slugAvailability) {
      return Promise.resolve({ slug: 'x', available: true, reason: null, message: null });
    }
    return Promise.reject(new Error('unexpected call'));
  });
});

describe('OwnedItemsScreen (board 32)', () => {
  it('lists the licences with source, version, scope and date, and links back to the catalog', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Sản phẩm đã mua' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace`,
    );
    const list = screen.getByRole('region', { name: 'Template đã sở hữu' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Khai trương phòng tập');
    expect(rows[0]).toHaveTextContent('Payload · Đã mua');
    expect(rows[0]).toHaveTextContent('v1');
    expect(rows[0]).toHaveTextContent('CÓ BẢN v2');
    expect(rows[0]).toHaveTextContent('Mọi site trong workspace');
    expect(rows[0]).toHaveTextContent('02/09/2026');
    expect(rows[1]).toHaveTextContent('Payload · Miễn phí');
    expect(rows[1]).not.toHaveTextContent('CÓ BẢN');
    expect(
      within(rows[0] as HTMLElement).getByRole('link', { name: 'Khai trương phòng tập' }),
    ).toHaveAttribute('href', `/workspaces/${WORKSPACE_ID}/marketplace/mp-khai-truong-phong-tap`);
  });

  it('marks a withdrawn item, which the workspace still uses', () => {
    renderScreen({ items: [ownedItemFixture({ withdrawn: true })] });
    expect(screen.getByText('Đã ngừng bán')).toBeInTheDocument();
  });

  it('says what the workspace has not got yet, and leads to the marketplace', () => {
    renderScreen({ items: [] });
    expect(screen.getByText('Workspace chưa có mẫu nào từ Marketplace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Khám phá Marketplace' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace`,
    );
  });

  it('offers "Cập nhật" only on a row with a newer version, and only with templates.manage', () => {
    renderScreen();
    expect(screen.getAllByRole('button', { name: /^Cập nhật/ })).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }),
    ).toBeInTheDocument();
  });

  it('hides "Cập nhật" from a role without templates.manage', () => {
    renderScreen({ role: 'viewer' });
    expect(screen.queryByRole('button', { name: /^Cập nhật/ })).toBeNull();
    // Viewing is all a viewer has: the row leads to the item instead of a dialog to create a page.
    expect(screen.queryByRole('button', { name: /^Tạo trang/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Xem mẫu/ })).toHaveLength(2);
  });

  it('asks before updating, with the notes of the new versions, and updates from the licence’s version', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(licenceFixture({ version: 2 }));
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    const dialog = screen.getByRole('dialog', { name: 'Cập nhật “Khai trương phòng tập” lên v2?' });
    expect(dialog).toHaveTextContent('Thêm section lịch lớp học.');
    expect(dialog).toHaveTextContent('01/12/2026');
    expect(dialog).toHaveTextContent(
      '2 trang đã tạo từ mẫu này không đổi. Chỉ trang tạo mới từ giờ dùng v2.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cập nhật mẫu' }));
    expect(apiMock).toHaveBeenCalledWith(
      endpoints.updateMarketplaceLicenceVersion,
      [WORKSPACE_ID, 'mp-khai-truong-phong-tap'],
      { body: { baseVersion: 1 } },
    );
    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('updates once when "Cập nhật mẫu" is clicked twice in a row', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(licenceFixture({ version: 2 }));
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    const confirm = screen.getByRole('button', { name: 'Cập nhật mẫu' });
    // Both clicks land before the mutation reports itself pending, as a double click does.
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(lastCallTo(apiMock, endpoints.updateMarketplaceLicenceVersion).options).toEqual({
      body: { baseVersion: 1 },
    });
    expect(
      apiMock.mock.calls.filter(
        ([endpoint]) => endpoint === endpoints.updateMarketplaceLicenceVersion,
      ),
    ).toHaveLength(1);
  });

  it('has the library and the editor read the item again at its new version', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(licenceFixture({ version: 2 }));
    const { queryClient } = renderScreen();
    queryClient.setQueryData(templateQueryKeys.all(WORKSPACE_ID), { items: [] });
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật mẫu' }));
    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(queryClient.getQueryState(templateQueryKeys.all(WORKSPACE_ID))?.isInvalidated).toBe(
      true,
    );
  });

  it('leaves the licence alone on "Để sau"', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    await user.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reads the list again and says so when another member updated it meanwhile', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'template_changed', 'Mẫu “Khai trương phòng tập” vừa được cập nhật lên v2'),
    );
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật mẫu' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Mẫu “Khai trương phòng tập” vừa được cập nhật ở nơi khác. Đã tải lại danh sách.',
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows why the update was refused, such as a read-only workspace', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(402, 'workspace_read_only', 'Workspace đang ở chế độ chỉ đọc'),
    );
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật mẫu' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Workspace đang ở chế độ chỉ đọc');
    expect(router.refresh).not.toHaveBeenCalled();
    // The plan stops it, not a permission (ADR-035): "Theo gói" and the way to board 28.
    expect(alert).toHaveAttribute('data-tone', 'warning');
    expect(alert).toHaveTextContent('Theo gói');
    expect(within(alert).getByRole('link', { name: 'Xem gói & thanh toán' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing`,
    );
  });

  it('opens without the failure of an earlier opening, for this row or another', async () => {
    const user = userEvent.setup();
    const spa = ownedItemFixture({
      itemId: 'mp-spa-uu-dai-ngay-le',
      name: 'Spa ưu đãi ngày lễ',
      source: 'purchase',
      version: 1,
      latestVersion: 2,
      newVersions: [{ version: 2, releasedOn: '2026-12-02', note: 'Thêm bảng giá.' }],
    });
    apiMock.mockRejectedValueOnce(apiError(500, 'internal', 'Lỗi máy chủ'));
    renderScreen({ items: [bought, spa] });
    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật mẫu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi máy chủ');
    await user.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cập nhật Khai trương phòng tập' }));
    expect(
      screen.getByRole('dialog', { name: 'Cập nhật “Khai trương phòng tập” lên v2?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Để sau' }));

    await user.click(screen.getByRole('button', { name: 'Cập nhật Spa ưu đãi ngày lễ' }));
    expect(
      screen.getByRole('dialog', { name: 'Cập nhật “Spa ưu đãi ngày lễ” lên v2?' }),
    ).toHaveTextContent('Thêm bảng giá.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('creates a page from the version of the licence, in the dialog of board 18', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Tạo trang từ Khai trương phòng tập' }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    expect(within(dialog).getByRole('textbox', { name: /Tên trang/ })).toHaveValue(
      'Khai trương phòng tập',
    );
    apiMock.mockResolvedValueOnce({ page: { id: 'p1' } });
    await user.click(within(dialog).getByRole('button', { name: 'Tạo bản nháp và mở editor' }));
    const call = lastCallTo(apiMock, endpoints.createPage);
    expect(call.args).toEqual([SITE_ID]);
    expect(call.options).toMatchObject({
      body: {
        start: {
          kind: 'template',
          source: 'marketplace',
          templateId: 'mp-khai-truong-phong-tap',
          version: 1,
        },
      },
    });
  });
});

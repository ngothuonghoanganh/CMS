import { type Access, endpoints, type Membership } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { MarketplaceItemScreen } from './MarketplaceItemScreen';
import { licenceFixture, marketplaceDetailFixture, termsFixture } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
});

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};

type ItemOverrides = Parameters<typeof marketplaceDetailFixture>[0];

function itemScreen(overrides: ItemOverrides, role: Access) {
  return (
    <MarketplaceItemScreen
      workspace={workspace}
      role={role}
      item={marketplaceDetailFixture(overrides)}
    />
  );
}

function renderItem(overrides: ItemOverrides = {}, role: Access = 'owner') {
  const rendered = renderWithProviders(itemScreen(overrides, role));
  return {
    ...rendered,
    /** The server's render after `router.refresh()`, with the item as it is now. */
    refreshed: (now: ItemOverrides) => {
      rendered.rerender(
        <QueryClientProvider client={rendered.queryClient}>
          <ToastProvider>{itemScreen({ ...overrides, ...now }, role)}</ToastProvider>
        </QueryClientProvider>,
      );
    },
  };
}

describe('MarketplaceItemScreen (board 31)', () => {
  it('shows the item, its meta line, its preview and the way back to the catalog', () => {
    const item = marketplaceDetailFixture();
    renderItem();
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace`,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Khai trương phòng tập' })).toBeVisible();
    expect(
      screen.getByText(`Sự kiện / webinar · Thể hình · ${item.sections.length} section · v1`, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(item.description)).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Bản xem trước trên máy tính: Khai trương phòng tập' }),
    ).toBeInTheDocument();
  });

  it('switches the preview to a phone', async () => {
    const user = userEvent.setup();
    renderItem();
    await user.click(screen.getByRole('button', { name: 'Điện thoại' }));
    expect(
      screen.getByRole('region', { name: 'Bản xem trước trên điện thoại: Khai trương phòng tập' }),
    ).toBeInTheDocument();
  });

  it('lists what it includes, from the page, with the form only when it has one', () => {
    const { unmount } = renderItem();
    const includes = screen.getByRole('region', { name: 'Gồm những gì' });
    expect(includes).toHaveTextContent(
      /\d+ section · \d+ bộ màu đạt AA · chữ mẫu tiếng Việt · form thu lead/,
    );
    expect(includes).not.toHaveTextContent('ảnh');
    unmount();

    renderItem({ hasForm: false });
    expect(screen.getByRole('region', { name: 'Gồm những gì' })).not.toHaveTextContent('form');
  });

  it('states the licence, update and support terms, and the news of the version', () => {
    renderItem({ releasedOn: '2026-10-20', version: 2, note: 'Thêm section lịch lớp.' });
    expect(screen.getByRole('region', { name: 'Giấy phép' })).toHaveTextContent(
      `Dùng cho mọi site trong workspace mua. ${termsFixture.summary}`,
    );
    expect(screen.getByRole('region', { name: 'Cập nhật & hỗ trợ' })).toHaveTextContent(
      `Phiên bản mới miễn phí cho workspace đã sở hữu. ${termsFixture.support}`,
    );
    const news = screen.getByRole('region', { name: 'Có gì mới ở v2 · 20/10/2026' });
    expect(news).toHaveTextContent('Thêm section lịch lớp.');
  });

  it('opens the full licence terms in a dialog', async () => {
    const user = userEvent.setup();
    renderItem();
    await user.click(screen.getByRole('button', { name: 'Điều khoản giấy phép' }));
    const dialog = await screen.findByRole('dialog', { name: 'Điều khoản giấy phép' });
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((paragraph) => paragraph.textContent),
    ).toEqual(termsFixture.licence);
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the price and the refund line, with "Mua mẫu" for the owner of a paid item not owned', () => {
    renderItem();
    const box = screen.getByRole('complementary', { name: 'Giá' });
    expect(box).toHaveTextContent('399.000đ');
    expect(box).toHaveTextContent('Một lần · Đã gồm VAT · Hoàn tiền theo chính sách của Payload');
    expect(within(box).getByRole('button', { name: 'Mua mẫu' })).toBeEnabled();
    expect(within(box).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /Nhận mẫu|Đề xuất/ })).toBeNull();
    expect(screen.queryByText(/nhà cung cấp/i)).toBeNull();
    // Nothing is asked or charged by looking.
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('offers a member who cannot pay to suggest it, not "Mua mẫu"', () => {
    renderItem({}, 'admin');
    const box = screen.getByRole('complementary', { name: 'Giá' });
    expect(within(box).getByRole('button', { name: 'Đề xuất Ngọc Anh mua' })).toBeEnabled();
    expect(box).toHaveTextContent('Chỉ Chủ sở hữu workspace mua được.');
    expect(screen.queryByRole('button', { name: 'Mua mẫu' })).toBeNull();
  });

  it('leaves the VAT and refund line out for a free item, as nothing is paid', () => {
    renderItem({ price: 0 });
    const box = screen.getByRole('complementary', { name: 'Giá' });
    expect(box).toHaveTextContent('Miễn phí');
    expect(box).not.toHaveTextContent('Đã gồm VAT');
    expect(box).not.toHaveTextContent(termsFixture.refund);
  });

  describe('a free item (ADR-036)', () => {
    it('names who may claim it when the role cannot', () => {
      renderItem({ price: 0 }, 'viewer');
      const box = screen.getByRole('complementary', { name: 'Giá' });
      expect(box).toHaveTextContent('Chỉ Chủ sở hữu, Quản trị và Biên tập nhận được mẫu miễn phí');
      expect(within(box).queryByRole('button')).toBeNull();
    });

    it('asks for the terms before claiming, and sends the version and terms it showed', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValueOnce(licenceFixture());
      renderItem({ price: 0, version: 1 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      const dialog = screen.getByRole('dialog', { name: 'Nhận mẫu' });
      expect(dialog).toHaveTextContent('Khai trương phòng tập · v1');
      const agree = within(dialog).getByRole('checkbox', {
        name: 'Tôi đồng ý với điều khoản giấy phép',
      });
      expect(agree).not.toBeChecked();
      const confirm = within(dialog).getByRole('button', { name: 'Nhận mẫu' });
      expect(confirm).toBeDisabled();
      await user.click(agree);
      expect(confirm).toBeEnabled();
      await user.click(confirm);
      expect(apiMock).toHaveBeenCalledWith(
        endpoints.claimMarketplaceItem,
        [WORKSPACE_ID, 'mp-khai-truong-phong-tap'],
        { body: { version: 1, termsVersion: termsFixture.version } },
      );
      await vi.waitFor(() => {
        expect(router.refresh).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Đã nhận “Khai trương phòng tập”');
    });

    it('keeps focus in the price box once the item is owned and "Nhận mẫu" is gone', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValueOnce(licenceFixture());
      const { refreshed } = renderItem({ price: 0, version: 1 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      await user.click(screen.getByRole('checkbox'));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận mẫu' }),
      );
      await vi.waitFor(() => {
        expect(router.refresh).toHaveBeenCalled();
      });

      refreshed({ licence: licenceFixture() });
      expect(screen.queryByRole('button', { name: 'Nhận mẫu' })).toBeNull();
      await vi.waitFor(() => {
        expect(screen.getByRole('link', { name: 'Tạo trang từ mẫu' })).toHaveFocus();
      });
      expect(screen.getByRole('status')).toHaveTextContent('Đã nhận “Khai trương phòng tập”');
    });

    it('lets the member read the terms they agree to without leaving the dialog', async () => {
      const user = userEvent.setup();
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      const dialog = screen.getByRole('dialog', { name: 'Nhận mẫu' });
      expect(within(dialog).queryByRole('region', { name: 'Điều khoản giấy phép v1' })).toBeNull();
      const toggle = within(dialog).getByRole('button', { name: 'Đọc điều khoản giấy phép' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAccessibleName('Ẩn điều khoản giấy phép');
      const terms = within(dialog).getByRole('region', { name: 'Điều khoản giấy phép v1' });
      expect(
        within(terms)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(termsFixture.licence);
      // Reading the terms neither ticks the box nor sends anything.
      expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
      expect(apiMock).not.toHaveBeenCalled();

      await user.click(toggle);
      expect(within(dialog).queryByRole('region', { name: 'Điều khoản giấy phép v1' })).toBeNull();
    });

    it('claims once when the confirm button is clicked twice in a row', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValueOnce(licenceFixture());
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      const dialog = screen.getByRole('dialog', { name: 'Nhận mẫu' });
      await user.click(within(dialog).getByRole('checkbox'));
      const confirm = within(dialog).getByRole('button', { name: 'Nhận mẫu' });
      // Both clicks land before the mutation reports itself pending, as a double click does.
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      await vi.waitFor(() => {
        expect(router.refresh).toHaveBeenCalled();
      });
      expect(apiMock).toHaveBeenCalledTimes(1);
    });

    it('does not send anything on "Hủy"', async () => {
      const user = userEvent.setup();
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      await user.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(apiMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('reads the screen again and asks again when the item changed meanwhile', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValueOnce(
        apiError(409, 'item_changed', 'Mẫu “Khai trương phòng tập” vừa thay đổi'),
      );
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      await user.click(screen.getByRole('checkbox'));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận mẫu' }),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Mẫu “Khai trương phòng tập” vừa thay đổi. Đã tải lại; xem lại mẫu và điều khoản rồi nhận lại.',
      );
      expect(router.refresh).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
      // Asking again starts from an unticked box.
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('says why a read-only workspace cannot claim, and keeps the dialog', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValueOnce(
        apiError(402, 'workspace_read_only', 'Workspace đang ở chế độ chỉ đọc'),
      );
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      await user.click(screen.getByRole('checkbox'));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận mẫu' }),
      );
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

    it('shows any other failure as an error, without the way to the plan', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValueOnce(apiError(500, 'internal', 'Lỗi máy chủ'));
      renderItem({ price: 0 });
      await user.click(screen.getByRole('button', { name: 'Nhận mẫu' }));
      await user.click(screen.getByRole('checkbox'));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận mẫu' }),
      );
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Lỗi máy chủ');
      expect(alert).toHaveAttribute('data-tone', 'danger');
      expect(within(alert).queryByRole('link')).toBeNull();
    });
  });

  describe('an item the workspace owns (ADR-036)', () => {
    it('shows the licence version and leads to screen 18 of the item', () => {
      renderItem({ price: 0, licence: licenceFixture({ version: 1 }) });
      const box = screen.getByRole('complementary', { name: 'Giá' });
      expect(box).toHaveTextContent('Workspace đã sở hữu · v1');
      expect(within(box).getByRole('link', { name: 'Tạo trang từ mẫu' })).toHaveAttribute(
        'href',
        `/workspaces/${WORKSPACE_ID}/templates/mp-khai-truong-phong-tap`,
      );
      expect(within(box).queryByRole('button', { name: 'Nhận mẫu' })).toBeNull();
      expect(box).not.toHaveTextContent('Cập nhật');
      expect(box).not.toHaveTextContent('ngừng bán');
    });

    it('offers the update on screen 32 when a newer version exists', () => {
      renderItem({ version: 2, licence: licenceFixture({ source: 'purchase', version: 1 }) });
      const box = screen.getByRole('complementary', { name: 'Giá' });
      expect(box).toHaveTextContent('Workspace đã sở hữu · v1');
      expect(box).toHaveTextContent('Có phiên bản mới v2.');
      expect(within(box).getByRole('link', { name: 'Cập nhật' })).toHaveAttribute(
        'href',
        `/workspaces/${WORKSPACE_ID}/marketplace/owned`,
      );
    });

    it('tells a role that cannot update who can, and still leads to screen 32', () => {
      renderItem(
        { version: 2, licence: licenceFixture({ source: 'purchase', version: 1 }) },
        'viewer',
      );
      const box = screen.getByRole('complementary', { name: 'Giá' });
      expect(box).toHaveTextContent(
        'Có phiên bản mới v2. Chỉ Chủ sở hữu, Quản trị và Biên tập cập nhật được, ở Sản phẩm đã mua.',
      );
      expect(within(box).queryByRole('link', { name: 'Cập nhật' })).toBeNull();
      expect(within(box).getByRole('link', { name: 'Sản phẩm đã mua' })).toHaveAttribute(
        'href',
        `/workspaces/${WORKSPACE_ID}/marketplace/owned`,
      );
    });

    it('says a withdrawn item is still used and updated', () => {
      renderItem({ withdrawn: true, licence: licenceFixture({ source: 'purchase' }) });
      expect(screen.getByRole('complementary', { name: 'Giá' })).toHaveTextContent(
        'Mẫu đã ngừng bán. Workspace vẫn dùng và cập nhật được.',
      );
    });

    it('owns a bought item without any button to buy it, under what was paid for it', () => {
      renderItem({ licence: licenceFixture({ source: 'purchase' }) });
      const box = screen.getByRole('complementary', { name: 'Giá' });
      // As board 31 draws its owned state: the one payment, VAT included, and the refund terms.
      expect(box).toHaveTextContent(
        `Đã sở hữuMột lần · Đã gồm VAT · ${termsFixture.refund}Workspace đã sở hữu · v1`,
      );
      expect(within(box).queryByRole('button')).toBeNull();
    });

    it('leaves the VAT and refund line out of an item received free, even one now paid', () => {
      renderItem({ price: 399_000, licence: licenceFixture({ source: 'free' }) });
      const box = screen.getByRole('complementary', { name: 'Giá' });
      expect(box).toHaveTextContent('Đã sở hữu');
      expect(box).not.toHaveTextContent('Một lần · Đã gồm VAT');
    });
  });
});

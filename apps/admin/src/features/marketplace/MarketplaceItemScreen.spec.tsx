import type { Membership } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_ID } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { MarketplaceItemScreen } from './MarketplaceItemScreen';
import { marketplaceDetailFixture, termsFixture } from './test-fixtures';

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};

function renderItem(overrides: Parameters<typeof marketplaceDetailFixture>[0] = {}) {
  return renderWithProviders(
    <MarketplaceItemScreen workspace={workspace} item={marketplaceDetailFixture(overrides)} />,
  );
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

  it('shows the price and the refund line, with no action to get or buy yet', () => {
    const { unmount } = renderItem();
    const box = screen.getByRole('complementary', { name: 'Giá' });
    expect(box).toHaveTextContent('399.000đ');
    expect(box).toHaveTextContent('Một lần · Đã gồm VAT · Hoàn tiền theo chính sách của Payload');
    expect(within(box).queryByRole('button')).toBeNull();
    expect(within(box).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /Mua mẫu|Nhận mẫu/ })).toBeNull();
    expect(screen.queryByText(/nhà cung cấp/i)).toBeNull();
    unmount();

    renderItem({ price: 0 });
    expect(screen.getByRole('complementary', { name: 'Giá' })).toHaveTextContent('Miễn phí');
  });
});

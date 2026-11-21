import type { Access, Membership } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_ID } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { MarketplaceScreen } from './MarketplaceScreen';
import { itemFixtures, listFixture } from './test-fixtures';

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};
const SITE_ID = '64b000000000000000000001';

function renderScreen(
  options: {
    role?: Access;
    catalog?: ReturnType<typeof listFixture>;
    aiSiteId?: string | null;
  } = {},
) {
  return renderWithProviders(
    <MarketplaceScreen
      workspace={workspace}
      role={options.role ?? 'owner'}
      catalog={options.catalog ?? listFixture()}
      aiSiteId={options.aiSiteId === undefined ? SITE_ID : options.aiSiteId}
    />,
  );
}

function cardNames(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
}

describe('MarketplaceScreen (board 30)', () => {
  it('lists every item as a card with its thumbnail, industry, price and a link to its screen', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mẫu do Payload soạn. Mẫu bạn nhận hoặc mua sẽ có trong Templates của workspace.',
      ),
    ).toBeInTheDocument();
    expect(cardNames()).toEqual(itemFixtures.map((item) => item.name));
    expect(screen.getByRole('status')).toHaveTextContent('4 mẫu');

    const card = screen.getByRole('article', { name: 'Khai trương phòng tập' });
    expect(
      within(card).getByRole('img', { name: 'Bản xem thu nhỏ: Khai trương phòng tập' }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('Thể hình');
    expect(card).toHaveTextContent('399.000đ');
    expect(within(card).getByRole('link', { name: 'Khai trương phòng tập' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace/mp-khai-truong-phong-tap`,
    );
    expect(
      within(screen.getByRole('article', { name: 'Khóa học tiếng Anh trẻ em' })).getByText(
        'Miễn phí',
      ),
    ).toBeInTheDocument();
    // Not in this catalog (ADR-036): other sellers, badges, selling one's own templates.
    expect(screen.queryByText(/Bán template của bạn/)).toBeNull();
    expect(screen.queryByText(/đã xác minh/i)).toBeNull();
  });

  it('links "Đã sở hữu · N" to board 32 with the count of licences', () => {
    renderScreen({ catalog: listFixture({ ownedCount: 3 }) });
    expect(screen.getByRole('link', { name: 'Đã sở hữu · 3' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace/owned`,
    );
  });

  it('keeps the link when nothing is owned yet, so the empty board 32 stays reachable', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: 'Đã sở hữu · 0' })).toBeInTheDocument();
  });

  it('marks an owned card "Đã sở hữu" in place of its price', () => {
    const [first, ...rest] = itemFixtures;
    if (first === undefined) {
      throw new Error('No marketplace item fixture');
    }
    renderScreen({
      catalog: listFixture({ items: [{ ...first, owned: true }, ...rest], ownedCount: 1 }),
    });
    const card = screen.getByRole('article', { name: first.name });
    expect(within(card).getByText('Đã sở hữu')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('399.000đ');
  });

  it('labels the search, the price filter and the sort, and offers the board’s choices', () => {
    renderScreen();
    expect(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' })).toBeInTheDocument();
    const price = screen.getByRole('combobox', { name: 'Giá' });
    expect(
      within(price)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Miễn phí và trả phí', 'Chỉ miễn phí', 'Chỉ trả phí']);
    const sort = screen.getByRole('combobox', { name: 'Sắp xếp' });
    expect(
      within(sort)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Mới cập nhật', 'Được dùng nhiều']);
  });

  it('finds items without accents and counts what it shows', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' }), 'khai truong');
    expect(cardNames()).toEqual(['Khai trương phòng tập']);
    expect(screen.getByRole('status')).toHaveTextContent('1 mẫu');
  });

  it('filters by price', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Giá' }), 'free');
    expect(cardNames()).toEqual(['Khóa học tiếng Anh trẻ em']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Giá' }), 'paid');
    expect(cardNames()).toHaveLength(3);
  });

  it('has one chip for "Tất cả" and each of the six industries, pressed one at a time', async () => {
    const user = userEvent.setup();
    renderScreen();
    const chips = screen.getByRole('group', { name: 'Ngành' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual([
      'Tất cả',
      'Nha khoa & y tế',
      'Spa & làm đẹp',
      'Giáo dục',
      'Bất động sản',
      'Nhà hàng & F&B',
      'Thể hình',
    ]);
    expect(within(chips).getByRole('button', { name: 'Tất cả' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(chips).getByRole('button', { name: 'Spa & làm đẹp' }));
    expect(cardNames()).toEqual(['Spa ưu đãi ngày lễ']);
    expect(within(chips).getByRole('button', { name: 'Spa & làm đẹp' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: 'Tất cả' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(within(chips).getByRole('button', { name: 'Tất cả' }));
    expect(cardNames()).toHaveLength(4);
  });

  it('sorts by use with "Được dùng nhiều"', async () => {
    const user = userEvent.setup();
    const catalog = listFixture({
      items: itemFixtures.map((item, index) => ({ ...item, popularRank: index === 3 ? 1 : 2 })),
    });
    renderScreen({ catalog });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sắp xếp' }), 'popular');
    expect(cardNames()[0]).toBe('Khóa học tiếng Anh trẻ em');
  });

  it('says what it found nothing for, and offers the system templates and the AI', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' }), 'thú y');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Marketplace chưa có mẫu khớp “thú y”' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 mẫu');
    expect(screen.getByRole('link', { name: 'Xem mẫu hệ thống' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?source=system`,
    );
    expect(screen.getByRole('link', { name: 'Tạo bằng AI' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/pages/new/ai`,
    );
    await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(cardNames()).toHaveLength(4);
    expect(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' })).toHaveFocus();
  });

  it('leaves out "Tạo bằng AI" without a site or without the right to edit pages', async () => {
    const user = userEvent.setup();
    const { unmount } = renderScreen({ aiSiteId: null });
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' }), 'zzz');
    expect(screen.getByRole('link', { name: 'Xem mẫu hệ thống' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tạo bằng AI' })).toBeNull();
    unmount();

    renderScreen({ role: 'viewer' });
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trên marketplace' }), 'zzz');
    expect(screen.queryByRole('link', { name: 'Tạo bằng AI' })).toBeNull();
  });

  it('explains an empty catalog', () => {
    renderScreen({ catalog: listFixture({ items: [] }) });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Marketplace chưa có mẫu nào' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa bộ lọc' })).toBeNull();
  });
});

import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { renderWithProviders } from '../shell/test-utils';
import { BillingScreen, type BillingScreenProps } from './BillingScreen';
import { catalog, summaryFixture } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';

function renderBilling(overrides: Partial<BillingScreenProps> = {}) {
  return renderWithProviders(
    <BillingScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      canManage
      initial={summaryFixture()}
      catalog={catalog}
      loadedAt={Date.now()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
});

describe('BillingScreen (board 28)', () => {
  it('shows the plan, its price and the trial in the status chip', () => {
    renderBilling();

    expect(screen.getByRole('heading', { name: 'Gói Agency' })).toBeInTheDocument();
    expect(screen.getByText('Dùng thử · còn 14 ngày')).toBeInTheDocument();
    expect(
      screen.getByText('599.000 ₫ / tháng · tính cho cả workspace Mây Xanh Agency'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dùng thử từ 20/11/2026 tới 04/12/2026')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bạn đang dùng thử Gói Agency.');
  });

  it('measures every limit against the plan', () => {
    renderBilling();

    const usage = screen.getByRole('list', { name: 'Mức sử dụng' });
    expect(within(usage).getAllByRole('listitem')).toHaveLength(5);
    expect(within(usage).getByText('4 / 5')).toBeInTheDocument();
    expect(within(usage).getByText('Gần chạm hạn mức')).toBeInTheDocument();
    expect(within(usage).getByRole('img', { name: 'Site: đã dùng 80 phần trăm' })).toBeVisible();
    expect(within(usage).getByText('1.240 / 5.000')).toBeInTheDocument();
    expect(within(usage).getAllByText('Làm mới 01/12')).toHaveLength(2);
  });

  it('compares the plans and marks the current one', () => {
    renderBilling();

    const table = screen.getByRole('table', { name: 'So sánh các gói' });
    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((head) => head.textContent)).toEqual([
      expect.stringContaining('Cơ bản'),
      expect.stringContaining('Agency'),
      expect.stringContaining('Doanh nghiệp'),
    ]);
    expect(within(heads[1] as HTMLElement).getByText('HIỆN TẠI')).toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Vai trò tùy chỉnh/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['— (không có)', '— (không có)', 'Có']);
  });

  it('offers no lifecycle action before it exists, and leads the trial to the card', () => {
    renderBilling();

    expect(screen.queryByRole('button', { name: /Hủy gói/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Thêm phương thức thanh toán' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
  });

  it('has the two tabs of boards 28 and 29', () => {
    renderBilling();

    const tabs = screen.getByRole('navigation', { name: 'Gói và thanh toán' });
    expect(within(tabs).getByRole('link', { name: 'Gói & mức dùng' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Thanh toán & hóa đơn' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
  });

  it('says what the gateway did when it leads back from adding a card', () => {
    const { unmount } = renderBilling({ returned: 'saved' });
    expect(screen.getByText('Đã lưu thẻ')).toBeInTheDocument();
    unmount();
    renderBilling({ returned: 'canceled' });
    expect(screen.getByText('Chưa thêm thẻ')).toBeInTheDocument();
  });

  it('shows a banner of the state, as an alert when work has stopped', () => {
    renderBilling({
      initial: summaryFixture({ state: 'trial_expired', access: 'read_only', trialDaysLeft: null }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Thời gian dùng thử đã hết.');
    expect(screen.getByText('Hết dùng thử')).toBeInTheDocument();
  });

  it('keeps the plan to Chủ sở hữu: others see who may change it, not a button', () => {
    renderBilling({ canManage: false });

    expect(screen.queryByRole('button', { name: 'Đổi gói' })).toBeNull();
    expect(screen.getByText('Chủ sở hữu workspace đổi được gói.')).toBeInTheDocument();
  });
});

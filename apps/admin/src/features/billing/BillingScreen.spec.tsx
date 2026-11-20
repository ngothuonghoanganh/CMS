import { endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { BillingScreen, type BillingScreenProps } from './BillingScreen';
import { billingQueryKeys } from './queries';
import { basic, catalog, summaryFixture } from './test-fixtures';

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

  it('offers no payment or lifecycle action before they exist', () => {
    renderBilling();

    expect(screen.queryByRole('button', { name: /Hủy gói|Thanh toán|phương thức/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /hóa đơn/i })).toBeNull();
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

  describe('"Đổi gói"', () => {
    it('changes the plan during the trial and updates what the sidebar reads', async () => {
      const user = userEvent.setup();
      const changed = summaryFixture({ plan: basic, usage: summaryFixture().usage });
      apiMock.mockResolvedValue(changed);
      const { queryClient } = renderBilling();

      await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
      const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
      expect(within(dialog).getByRole('button', { name: 'Đổi sang Gói Agency' })).toBeDisabled();

      await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ })); // What goes over the smaller plan is said before it is chosen.
      expect(within(dialog).getByText(/4 site, vượt hạn mức Gói Cơ bản/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Automation đang bật sẽ tạm dừng/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Đổi sang Gói Cơ bản' }));

      expect(lastCallTo(apiMock, endpoints.changePlan)).toEqual({
        args: [WORKSPACE_ID],
        options: { body: { planId: 'basic', cycle: 'monthly' } },
      });
      expect(await screen.findByText('Đã đổi sang Gói Cơ bản')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(queryClient.getQueryData(billingQueryKeys.plan(WORKSPACE_ID))).toMatchObject({
        plan: { id: 'basic', features: { automation: false } },
        access: 'full',
      });
      expect(screen.getByRole('heading', { name: 'Gói Cơ bản' })).toBeInTheDocument();
    });

    it('changes the cycle of the same plan', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValue(summaryFixture({ cycle: 'yearly' }));
      renderBilling();

      await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
      const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
      await user.click(within(dialog).getByRole('button', { name: 'Theo năm' }));
      expect(within(dialog).getByText(/5\.990\.000 ₫ \/ năm/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Đổi sang Gói Agency' }));

      expect(lastCallTo(apiMock, endpoints.changePlan).options).toEqual({
        body: { planId: 'agency', cycle: 'yearly' },
      });
    });

    it('shows the API message when the plan cannot change yet, and keeps the dialog', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValue(
        apiError(409, 'plan_change_unavailable', 'Chưa đổi được gói lúc này'),
      );
      renderBilling({ initial: summaryFixture({ state: 'active', trialDaysLeft: null }) });

      await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
      const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
      await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Đổi sang Gói Doanh nghiệp' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Chưa đổi được gói lúc này',
      );
      // The dialog is modal, so the page behind it is hidden from the tree.
      expect(screen.getByRole('heading', { name: 'Gói Agency', hidden: true })).toBeInTheDocument();
    });
  });
});

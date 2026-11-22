import { endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { renderWithProviders } from '../shell/test-utils';
import { BillingScreen, type BillingScreenProps } from './BillingScreen';
import { catalog, summaryFixture, visaCard } from './test-fixtures';

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

  it('leads a trial without a card to adding one', () => {
    renderBilling({
      initial: summaryFixture({
        renewal: {
          at: '2026-12-04T03:00:00.000Z',
          planId: 'agency',
          planName: 'Agency',
          cycle: 'monthly',
          amount: 599_000,
          method: 'card' as const,
          invoiceAt: null,
          invoice: null,
          paid: false,
          autoRenews: false,
          blocker: 'no_payment_method',
        },
      }),
    });

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

  it('says what the gateway did when it leads back from adding a card', async () => {
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.getPaymentMethod
        ? Promise.resolve({ paymentMethod: visaCard, paymentsEnabled: true })
        : Promise.reject(new Error('unexpected call')),
    );
    const { unmount } = renderBilling({ returned: 'saved' });
    expect(await screen.findByText('Đã lưu thẻ')).toBeInTheDocument();
    expect(screen.getByText(/Thẻ Visa •••• 4242 là phương thức thanh toán mặc định/)).toBeVisible();
    unmount();
    renderBilling({ returned: 'canceled' });
    expect(screen.getByText('Chưa thêm thẻ')).toBeInTheDocument();
  });

  it('claims a saved card only when the card is there', async () => {
    // An address typed by hand, or a gateway event still on its way.
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.getPaymentMethod
        ? Promise.resolve({ paymentMethod: null, paymentsEnabled: true })
        : Promise.reject(new Error('unexpected call')),
    );
    renderBilling({ returned: 'saved' });

    expect(await screen.findByText('Đang chờ cổng thanh toán xác nhận thẻ')).toBeInTheDocument();
    expect(screen.queryByText('Đã lưu thẻ')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeEnabled();
  });

  it('says a period ended with a card on file is being paid, with nothing to click there', () => {
    renderBilling({
      initial: summaryFixture({
        state: 'past_due',
        access: 'full',
        trialDaysLeft: null,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
      }),
    });

    expect(screen.getByText('Đang thanh toán kỳ mới.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chọn gói và thanh toán' })).toBeNull();
    // "Đổi gói" stays the way to choose and pay.
    expect(screen.getByRole('button', { name: 'Đổi gói' })).toBeEnabled();
  });

  it('shows a failed period whose transfer waits as waiting, chip included', () => {
    renderBilling({
      initial: summaryFixture({
        state: 'past_due',
        trialDaysLeft: null,
        trialEndsAt: null,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
        dueInvoice: {
          id: '64b0000000000000000000f1',
          number: 'HD-2026-000001',
          kind: 'subscription',
          planId: 'agency',
          planName: 'Agency',
          cycle: 'monthly',
          periodStart: '2026-12-04T03:00:00.000Z',
          periodEnd: '2027-01-04T03:00:00.000Z',
          item: null,
          amount: 599_000,
          method: 'transfer',
          status: 'pending',
          createdAt: '2026-12-04T03:00:00.000Z',
          paidAt: null,
          payable: true,
          lastAttempt: null,
        },
      }),
    });

    expect(screen.getByText('Chờ thanh toán')).toBeInTheDocument();
    expect(screen.queryByText('Quá hạn')).toBeNull();
    expect(screen.getByText('Đang chờ xác nhận chuyển khoản.')).toBeInTheDocument();
  });

  it('offers "Hủy thay đổi" only while the period is paid', () => {
    const scheduled = {
      trialDaysLeft: null,
      trialEndsAt: null,
      scheduledChange: { planId: 'basic' as const, cycle: 'monthly' as const },
    };
    const { unmount } = renderBilling({
      initial: summaryFixture({ ...scheduled, state: 'active' }),
    });
    expect(screen.getByRole('button', { name: 'Hủy thay đổi' })).toBeEnabled();
    unmount();

    renderBilling({ initial: summaryFixture({ ...scheduled, state: 'past_due' }) });
    expect(screen.getByText(/Chuyển sang Gói Cơ bản/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi' })).toBeNull();
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

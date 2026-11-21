import { endpoints, type ErrorCode } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-core';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { BillingScreen, type BillingScreenProps } from './BillingScreen';
import { billingQueryKeys } from './queries';
import { catalog, quoteFixture, summaryFixture, visaCard, business } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const PERIOD_END = '2026-12-01T03:00:00.000Z';

const paid = summaryFixture({
  state: 'active',
  trialEndsAt: null,
  trialDaysLeft: null,
  periodStart: '2026-11-01T03:00:00.000Z',
  periodEnd: PERIOD_END,
  renewal: {
    at: PERIOD_END,
    planId: 'agency',
    planName: 'Agency',
    cycle: 'monthly',
    amount: 599_000,
    autoRenews: true,
    blocker: null,
  },
});
const canceled = {
  ...paid,
  state: 'cancel_scheduled' as const,
  cancelAt: PERIOD_END,
  renewal: null,
};

function renderBilling(overrides: Partial<BillingScreenProps> = {}) {
  return renderWithProviders(
    <BillingScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      canManage
      initial={paid}
      catalog={catalog}
      loadedAt={Date.now()}
      {...overrides}
    />,
  );
}

function problem(status: number, code: ErrorCode, context?: Record<string, unknown>) {
  return new ApiError(status, {
    type: 'about:blank',
    title: 'Lỗi',
    status,
    code,
    ...(context === undefined ? {} : { context }),
  });
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
});

describe('the period line and the banner of a paid plan', () => {
  it('says when it renews by itself and has no banner', () => {
    renderBilling();

    expect(
      screen.getByText('Kỳ hiện tại 01/11/2026 – 01/12/2026 · gia hạn tự động 01/12/2026'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy gói' })).toBeEnabled();
  });

  it('offers no "Hủy gói" to a role that cannot manage the plan, or once it is set', () => {
    const { unmount } = renderBilling({ canManage: false });
    expect(screen.queryByRole('button', { name: 'Hủy gói' })).toBeNull();
    unmount();
    renderBilling({ initial: canceled });
    expect(screen.queryByRole('button', { name: 'Hủy gói' })).toBeNull();
  });
});

describe('"Hủy gói"', () => {
  it('says what happens at the end of the period before it cancels', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.cancelPlan
        ? Promise.resolve(canceled)
        : Promise.reject(new Error('unexpected call')),
    );
    const { queryClient } = renderBilling();

    await user.click(screen.getByRole('button', { name: 'Hủy gói' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Hủy Gói Agency?' });
    expect(dialog).toHaveTextContent('Trang live và form vẫn chạy.');
    expect(dialog).toHaveTextContent('chuyển sang chế độ chỉ đọc');
    expect(dialog).toHaveTextContent('Không dữ liệu nào bị xóa.');
    expect(dialog).toHaveTextContent('không được hoàn tiền');
    // Nothing is sent until the owner confirms.
    expect(apiMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Hủy gói' }));

    expect(await screen.findByText('Đã hủy gói')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The banner, the chip and the plan the sidebar reads follow at once.
    expect(screen.getByText('Gói sẽ dừng vào 01/12/2026.')).toBeVisible();
    expect(screen.getByText('Đã lên lịch hủy')).toBeInTheDocument();
    expect(queryClient.getQueryData(billingQueryKeys.plan(WORKSPACE_ID))).toMatchObject({
      state: 'cancel_scheduled',
    });
  });

  it('keeps the dialog open with the reason when the API refuses', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(problem(409, 'plan_change_unavailable', { reason: 'unpaid' }));
    renderBilling();

    await user.click(screen.getByRole('button', { name: 'Hủy gói' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy gói' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Kỳ hiện tại chưa được thanh toán.',
    );
  });
});

describe('"Giữ lại gói"', () => {
  it('withdraws the cancellation from the banner', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.keepPlan
        ? Promise.resolve(paid)
        : Promise.reject(new Error('unexpected call')),
    );
    renderBilling({ initial: canceled });

    expect(screen.getByRole('status')).toHaveTextContent('Gói sẽ dừng vào 01/12/2026.');
    await user.click(screen.getByRole('button', { name: 'Giữ lại gói' }));

    expect(await screen.findByText('Đã giữ lại Gói Agency')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Giữ lại gói' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy gói' })).toBeEnabled();
  });

  it('says why when the plan has stopped meanwhile', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.keepPlan
        ? Promise.reject(problem(409, 'plan_change_unavailable', { reason: 'payment_required' }))
        : Promise.resolve(canceled),
    );
    renderBilling({ initial: canceled });

    await user.click(screen.getByRole('button', { name: 'Giữ lại gói' }));

    expect(await screen.findByText('Chưa giữ lại được gói')).toBeInTheDocument();
    // Said for keeping a stopped plan, not for an ended trial.
    expect(screen.getByText('Gói đã dừng. Chọn gói mới để dùng tiếp.')).toBeInTheDocument();
  });
});

describe('a scheduled change', () => {
  const scheduled = {
    ...paid,
    scheduledChange: { planId: 'basic' as const, cycle: 'monthly' as const },
  };

  it('shows its plan and date with "Hủy thay đổi", which drops it', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.cancelScheduledChange
        ? Promise.resolve(paid)
        : Promise.reject(new Error('unexpected call')),
    );
    renderBilling({ initial: scheduled });

    expect(screen.getByText('Chuyển sang Gói Cơ bản · theo tháng từ 01/12/2026')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));

    expect(await screen.findByText('Đã hủy thay đổi đã lên lịch')).toBeInTheDocument();
    expect(screen.queryByText(/Chuyển sang Gói Cơ bản/)).toBeNull();
  });

  it('is named in "Đổi gói", where choosing again replaces it', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(quoteFixture({ mode: 'unchanged' }));
    renderBilling({ initial: scheduled });

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    expect(dialog).toHaveTextContent('Chuyển sang Gói Cơ bản · theo tháng từ 01/12/2026.');
    expect(dialog).toHaveTextContent('Chọn gói hay chu kỳ khác sẽ thay lịch này.');
    expect(within(dialog).getByRole('radio', { name: /Gói Cơ bản \(đã lên lịch\)/ })).toBeVisible();
  });

  it('is only for who manages the plan', () => {
    renderBilling({ initial: scheduled, canManage: false });

    expect(screen.getByText(/Chuyển sang Gói Cơ bản/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi' })).toBeNull();
  });
});

describe('"Đổi gói" to a lower plan in a paid period', () => {
  const SCHEDULED_QUOTE = quoteFixture({
    mode: 'scheduled',
    planId: 'basic',
    effectiveAt: PERIOD_END,
    nextAmount: 199_000,
    impacts: {
      overLimits: [{ limit: 'sites', used: 4, max: 1 }],
      automationsToPause: 3,
      aiUses: { from: 300, to: 30 },
      members: 7,
    },
  });

  it('says the date, the impacts and the next price, and schedules without charging', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint, _args, options) => {
      if (endpoint === endpoints.getPlanChangeQuote) {
        const { planId } = (options as { query: { planId: string } }).query;
        return Promise.resolve(
          planId === 'basic' ? SCHEDULED_QUOTE : quoteFixture({ mode: 'unchanged' }),
        );
      }
      if (endpoint === endpoints.changePlan) {
        return Promise.resolve({
          ...paid,
          scheduledChange: { planId: 'basic', cycle: 'monthly' },
        });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderBilling();

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));

    expect(
      await within(dialog).findByText('Chuyển xuống Gói Cơ bản từ 01/12/2026?'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Gói Agency giữ nguyên tới hết kỳ này.');
    expect(dialog).toHaveTextContent('Phí kỳ sau: 199.000 ₫ / tháng.');
    expect(dialog).toHaveTextContent('không được hoàn tiền');
    const list = within(dialog).getByRole('list', { name: 'Điều gì thay đổi' });
    expect(list).toHaveTextContent('4 site, vượt hạn mức Gói Cơ bản (1).');
    expect(list).toHaveTextContent('3 automation đang bật sẽ tạm dừng.');
    expect(list).toHaveTextContent('7 thành viên giữ nguyên quyền.');
    expect(within(dialog).queryByRole('button', { name: /Thanh toán ngay/ })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Lên lịch hạ gói' }));

    const call = lastCallTo(apiMock, endpoints.changePlan);
    expect(call.options).toMatchObject({ body: { planId: 'basic', cycle: 'monthly' } });
    expect((call.options as { body: object }).body).not.toHaveProperty('expectedAmount');
    expect(await screen.findByText('Đã lên lịch đổi gói')).toBeInTheDocument();
    expect(screen.getByText('Chuyển sang Gói Cơ bản · theo tháng từ 01/12/2026')).toBeVisible();
    // The plan in force did not change.
    expect(screen.getByRole('heading', { name: 'Gói Agency' })).toBeInTheDocument();
  });

  it('lays three plans out in one row, which wraps by itself on a phone', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(quoteFixture({ mode: 'unchanged' }));
    renderBilling();

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    const grid = within(dialog).getByRole('group', { name: 'Gói dịch vụ' }).querySelector('div');
    expect(grid?.style.gridTemplateColumns).toContain('auto-fit');
  });
});

describe('"Chọn gói mới" after a cancellation', () => {
  const stopped = summaryFixture({
    state: 'canceled',
    access: 'read_only',
    trialEndsAt: null,
    trialDaysLeft: null,
    cancelAt: PERIOD_END,
    periodEnd: PERIOD_END,
  });
  const START = quoteFixture({
    mode: 'start_paid',
    planId: 'business',
    amount: 1_490_000,
    periodStart: '2026-12-02T03:00:00.000Z',
    periodEnd: '2027-01-02T03:00:00.000Z',
    paymentMethod: visaCard,
  });

  it('pays the first period of a plan from now, by card or by bank transfer', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint, _args, options) => {
      if (endpoint === endpoints.getPlanChangeQuote) {
        return Promise.resolve(START);
      }
      if (endpoint === endpoints.changePlan) {
        const { body, onStatus } = options as {
          body: { payWith?: string };
          onStatus: (status: number) => void;
        };
        if (body.payWith === 'transfer') {
          onStatus(202);
        }
        return Promise.resolve(
          body.payWith === 'transfer'
            ? { ...stopped, plan: business }
            : { ...stopped, plan: business, state: 'active', access: 'full' },
        );
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderBilling({ initial: stopped });

    expect(screen.getByRole('alert')).toHaveTextContent('Gói đã hủy từ 01/12/2026.');
    await user.click(screen.getByRole('button', { name: 'Chọn gói mới' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    expect(dialog).toHaveTextContent('Gói đã hủy.');
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    expect(
      await within(dialog).findByRole('button', { name: 'Thanh toán ngay 1.490.000 ₫' }),
    ).toBeEnabled();
    // A stopped plan starts again: there is no trial to end.
    expect(dialog).toHaveTextContent('Thanh toán ngay mở lại gói, với một kỳ mới tính từ hôm nay.');
    expect(dialog).not.toHaveTextContent('dùng thử');
    expect(
      apiMock.mock.calls.every(
        ([endpoint, , options]) =>
          endpoint !== endpoints.getPlanChangeQuote ||
          (options as { query: { payNow: string } }).query.payNow === 'true',
      ),
    ).toBe(true);

    await user.click(within(dialog).getByRole('button', { name: 'Chuyển khoản' }));

    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { planId: 'business', payNow: true, expectedAmount: 1_490_000, payWith: 'transfer' },
    });
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Đang chờ chuyển khoản');
    expect(within(dialog).getByRole('link', { name: 'Thanh toán & hóa đơn' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
  });
});

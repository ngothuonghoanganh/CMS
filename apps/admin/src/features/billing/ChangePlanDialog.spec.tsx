import { endpoints, type ErrorCode } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-core';
import { navigateTo } from '../../lib/navigate';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { BillingScreen, type BillingScreenProps } from './BillingScreen';
import { billingQueryKeys } from './queries';
import { basic, business, catalog, quoteFixture, summaryFixture, visaCard } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));
vi.mock(import('../../lib/navigate'), () => ({ navigateTo: vi.fn() }));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const INVOICE_ID = '64b0000000000000000000b1';

type Quotes = Partial<Record<'free' | 'paid', ReturnType<typeof quoteFixture>>>;

/** Answers the quote calls by `payNow`, and whatever `changePlan` should do. */
function route(quotes: Quotes, change?: (options: Parameters<typeof api>[2]) => unknown) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.getPlanChangeQuote) {
      const query = (options as { query: { payNow: string } }).query;
      const quote = quotes[query.payNow === 'true' ? 'paid' : 'free'];
      return quote === undefined ? Promise.reject(new Error('no quote')) : Promise.resolve(quote);
    }
    if (endpoint === endpoints.changePlan && change !== undefined) {
      return Promise.resolve(change(options));
    }
    if (endpoint === endpoints.startPaymentMethodSetup) {
      return Promise.resolve({ url: 'https://gateway.test/setup?session=abc' });
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function problem(status: number, code: ErrorCode, context?: Record<string, unknown>) {
  return new ApiError(status, {
    type: 'about:blank',
    title: 'Lỗi của máy chủ',
    status,
    code,
    ...(context === undefined ? {} : { context }),
  });
}

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

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
  return screen.findByRole('dialog', { name: 'Đổi gói' });
}

const PAY_QUOTE = quoteFixture({
  mode: 'start_paid',
  planId: 'business',
  amount: 1_490_000,
  periodStart: '2026-11-21T03:00:00.000Z',
  periodEnd: '2026-12-21T03:00:00.000Z',
  paymentMethod: visaCard,
});

beforeEach(() => {
  apiMock.mockReset();
  vi.mocked(navigateTo).mockReset();
});

describe('"Đổi gói" in the trial', () => {
  it('changes the plan for free and updates what the sidebar reads', async () => {
    const user = userEvent.setup();
    route(
      {
        free: quoteFixture({ planId: 'basic' }),
        paid: quoteFixture({ mode: 'start_paid', planId: 'basic', amount: 199_000 }),
      },
      () => summaryFixture({ plan: basic }),
    );
    const { queryClient } = renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));
    // What goes over the smaller plan is said before it is chosen.
    expect(within(dialog).getByText(/4 site, vượt hạn mức Gói Cơ bản/)).toBeInTheDocument();
    const free = within(dialog).getByRole('button', { name: 'Đổi miễn phí' });
    await vi.waitFor(() => {
      expect(free).toBeEnabled();
    });
    await user.click(free);

    expect(lastCallTo(apiMock, endpoints.changePlan)).toMatchObject({
      args: [WORKSPACE_ID],
      options: { body: { planId: 'basic', cycle: 'monthly' } },
    });
    expect(await screen.findByText('Đã đổi sang Gói Cơ bản')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(queryClient.getQueryData(billingQueryKeys.plan(WORKSPACE_ID))).toMatchObject({
      plan: { id: 'basic' },
      access: 'full',
    });
  });

  it('pays now with the quoted amount, which ends the trial', async () => {
    const user = userEvent.setup();
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE }, () =>
      summaryFixture({ plan: business, state: 'active', trialDaysLeft: null }),
    );
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    const pay = await within(dialog).findByRole('button', {
      name: 'Thanh toán ngay 1.490.000 ₫',
    });
    expect(within(dialog).getByText(/Trừ vào Thẻ Visa •••• 4242/)).toBeInTheDocument();
    expect(within(dialog).getByText(/kết thúc dùng thử/)).toBeInTheDocument();
    await user.click(pay);

    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { planId: 'business', cycle: 'monthly', payNow: true, expectedAmount: 1_490_000 },
    });
    expect(await screen.findByText('Đã đổi sang Gói Doanh nghiệp')).toBeInTheDocument();
    expect(screen.getByText('Đã thanh toán 1.490.000 ₫.')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
  });

  it('asks for a card before it charges, and sends the owner to the gateway', async () => {
    const user = userEvent.setup();
    route({
      free: quoteFixture({ planId: 'business' }),
      paid: { ...PAY_QUOTE, paymentMethod: null, paymentMethodRequired: true },
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    const pay = await within(dialog).findByRole('button', { name: /Thanh toán ngay/ });
    expect(pay).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Thêm thẻ' }));

    expect(lastCallTo(apiMock, endpoints.startPaymentMethodSetup).options).toEqual({
      body: { returnTo: 'plan' },
    });
    await vi.waitFor(() => {
      expect(navigateTo).toHaveBeenCalledWith('https://gateway.test/setup?session=abc');
    });
    // Busy until the page is left: a second click opens no second session.
    const add = within(dialog).getByRole('button', { name: 'Thêm thẻ' });
    expect(add).toHaveAttribute('aria-busy', 'true');
    await user.click(add);
    expect(
      apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.startPaymentMethodSetup),
    ).toHaveLength(1);
  });

  it('says why the gateway page could not be opened', async () => {
    const user = userEvent.setup();
    route({
      free: quoteFixture({ planId: 'business' }),
      paid: { ...PAY_QUOTE, paymentMethod: null, paymentMethodRequired: true },
    });
    const routed = apiMock.getMockImplementation();
    apiMock.mockImplementation((endpoint, args, options) =>
      endpoint === endpoints.startPaymentMethodSetup
        ? Promise.reject(problem(503, 'payments_disabled'))
        : (routed?.(endpoint, args, options) ?? Promise.reject(new Error('unexpected call'))),
    );
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: 'Thêm thẻ' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Chưa mở được trang của cổng thanh toán');
    expect(alert).toHaveTextContent('Thanh toán chưa được bật trên hệ thống này.');
    expect(within(dialog).getByRole('button', { name: 'Thêm thẻ' })).not.toHaveAttribute(
      'aria-busy',
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('shows the gateway reason when the card is refused, and where the invoice is', async () => {
    const user = userEvent.setup();
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE }, () => {
      throw problem(402, 'payment_failed', {
        invoiceId: INVOICE_ID,
        invoiceNumber: 'HD-2026-000001',
        code: 'insufficient_funds',
      });
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay/ }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Thẻ không đủ hạn mức. Hóa đơn HD-2026-000001 chưa được thanh toán.',
    );
    expect(within(alert).getByRole('link', { name: 'Xem lịch sử giao dịch' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
    // Not a plan problem: nothing offers "Nâng cấp".
    expect(within(dialog).queryByText(/Nâng cấp/)).toBeNull();
    expect(screen.queryByText(/Đã đổi sang/)).toBeNull();
  });

  it('points to the invoice whose outcome is unknown instead of charging again', async () => {
    const user = userEvent.setup();
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE }, () => {
      throw problem(409, 'payment_in_progress', {
        invoiceId: INVOICE_ID,
        invoiceNumber: 'HD-2026-000001',
      });
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay/ }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Chưa biết kết quả thanh toán hóa đơn HD-2026-000001. Bấm "Thanh toán lại" ở hóa đơn đó',
    );
    expect(within(alert).getByRole('link', { name: 'Xem lịch sử giao dịch' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
  });

  it('drops the answer to the last choice once another plan or cycle is chosen', async () => {
    const user = userEvent.setup();
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE }, () => {
      throw problem(402, 'payment_failed', {
        invoiceId: INVOICE_ID,
        invoiceNumber: 'HD-2026-000001',
        code: 'card_declined',
      });
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ngân hàng từ chối thẻ');

    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ngân hàng từ chối thẻ');
    await user.click(within(dialog).getByRole('button', { name: 'Theo năm' }));
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('shows the new amount when the quote changed, and confirms that one', async () => {
    const user = userEvent.setup();
    let call = 0;
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE }, () => {
      call += 1;
      if (call === 1) {
        throw problem(409, 'quote_changed', {
          quote: { ...PAY_QUOTE, amount: 1_500_000 },
        });
      }
      return summaryFixture({ plan: business, state: 'active', trialDaysLeft: null });
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay 1\.490/ }));

    expect(
      await within(dialog).findByRole('button', { name: 'Thanh toán ngay 1.500.000 ₫' }),
    ).toBeEnabled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Số tiền đã thay đổi');
    await user.click(within(dialog).getByRole('button', { name: 'Thanh toán ngay 1.500.000 ₫' }));
    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { expectedAmount: 1_500_000 },
    });
  });

  it('says "Đang xử lý" while the gateway decides (202)', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint, _args, options) => {
      if (endpoint === endpoints.getPlanChangeQuote) {
        const query = (options as { query: { payNow: string } }).query;
        return Promise.resolve(
          query.payNow === 'true' ? PAY_QUOTE : quoteFixture({ planId: 'business' }),
        );
      }
      options?.onStatus?.(202);
      return Promise.resolve(summaryFixture());
    });
    renderBilling();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay/ }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Đang xử lý thanh toán');
    expect(screen.queryByText(/Đã đổi sang/)).toBeNull();
    // The dialog's own close icon and the footer's "Đóng".
    expect(within(dialog).getAllByRole('button', { name: 'Đóng' })).toHaveLength(2);
  });
});

describe('coming back from the gateway', () => {
  it('drops "Đã lưu thẻ" once the owner goes on to choose a plan', async () => {
    const user = userEvent.setup();
    route({ free: quoteFixture({ planId: 'business' }), paid: PAY_QUOTE });
    const routed = apiMock.getMockImplementation();
    apiMock.mockImplementation((endpoint, args, options) =>
      endpoint === endpoints.getPaymentMethod
        ? Promise.resolve({ paymentMethod: visaCard, paymentsEnabled: true })
        : (routed?.(endpoint, args, options) ?? Promise.reject(new Error('unexpected call'))),
    );
    renderBilling({ returned: 'saved' });

    expect(await screen.findByText('Đã lưu thẻ')).toBeInTheDocument();
    await openDialog(user);
    expect(screen.queryByText('Đã lưu thẻ')).toBeNull();
  });
});

describe('"Đổi gói" after the trial', () => {
  it('offers only paying now', async () => {
    const user = userEvent.setup();
    route({ paid: { ...PAY_QUOTE, planId: 'agency', amount: 599_000 } }, () =>
      summaryFixture({ state: 'active', trialDaysLeft: null }),
    );
    renderBilling({
      initial: summaryFixture({ state: 'trial_expired', access: 'read_only', trialDaysLeft: null }),
    });

    await user.click(screen.getByRole('button', { name: 'Chọn gói và thanh toán' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    expect(within(dialog).queryByRole('button', { name: 'Đổi miễn phí' })).toBeNull();
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay 599/ }));

    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { planId: 'agency', payNow: true, expectedAmount: 599_000 },
    });
  });
});

describe('"Đổi gói" once the trial ended unpaid with a card on file (past due)', () => {
  it('offers paying now, as for an ended trial', async () => {
    const user = userEvent.setup();
    route({ paid: { ...PAY_QUOTE, planId: 'agency', amount: 599_000 } }, () =>
      summaryFixture({ state: 'active', trialDaysLeft: null, trialEndsAt: null }),
    );
    renderBilling({
      initial: summaryFixture({
        state: 'past_due',
        access: 'read_only',
        trialDaysLeft: null,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Chọn gói và thanh toán' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    expect(dialog).toHaveAccessibleDescription(/Thời gian dùng thử đã hết/);
    expect(within(dialog).queryByRole('button', { name: 'Đổi miễn phí' })).toBeNull();
    await user.click(await within(dialog).findByRole('button', { name: /Thanh toán ngay 599/ }));

    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { planId: 'agency', payNow: true, expectedAmount: 599_000 },
    });
    // Only paying is asked about: a free change is not offered after the trial.
    const quotes = apiMock.mock.calls.filter(
      ([endpoint]) => endpoint === endpoints.getPlanChangeQuote,
    );
    expect(
      quotes.every(
        ([, , options]) => (options as { query: { payNow: string } }).query.payNow === 'true',
      ),
    ).toBe(true);
  });
});

describe('"Đổi gói" in a paid period', () => {
  const active = summaryFixture({ state: 'active', trialDaysLeft: null, trialEndsAt: null });

  it('previews the prorated upgrade before charging it', async () => {
    const user = userEvent.setup();
    route(
      {
        free: quoteFixture({
          mode: 'upgrade',
          planId: 'business',
          amount: 300_000,
          remainingDays: 10,
          periodDays: 30,
          periodStart: '2026-11-21T03:00:00.000Z',
          periodEnd: '2026-12-01T03:00:00.000Z',
          paymentMethod: visaCard,
        }),
      },
      () => summaryFixture({ plan: business, state: 'active', trialDaysLeft: null }),
    );
    renderBilling({ initial: active });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Doanh nghiệp/ }));
    const upgrade = await within(dialog).findByRole('button', {
      name: 'Nâng cấp và thanh toán 300.000 ₫',
    });
    expect(within(dialog).getByText(/10\/30 ngày còn lại/)).toBeInTheDocument();
    await user.click(upgrade);

    expect(lastCallTo(apiMock, endpoints.changePlan).options).toMatchObject({
      body: { planId: 'business', cycle: 'monthly', expectedAmount: 300_000 },
    });
    expect(await screen.findByText('Đã đổi sang Gói Doanh nghiệp')).toBeInTheDocument();
  });

  it('says why a plan cannot change now', async () => {
    const user = userEvent.setup();
    route({
      free: quoteFixture({
        mode: 'unavailable',
        planId: 'basic',
        unavailableReason: 'unpaid',
      }),
    });
    renderBilling({ initial: active });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));

    expect(
      await within(dialog).findByText(/Thanh toán kỳ này trước khi đổi gói/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đổi gói' })).toBeDisabled();
  });
});

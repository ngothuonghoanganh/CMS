import {
  type BillingSummary,
  endpoints,
  type DueInvoice,
  type Invoice,
  type SubscriptionRenewal,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { BillingScreen } from './BillingScreen';
import { CancelPlanDialog } from './CancelPlanDialog';
import { PaymentsScreen, type PaymentsScreenProps } from './PaymentsScreen';
import {
  catalog,
  invoiceFixture,
  invoiceSummaryFixture,
  quoteFixture,
  summaryFixture,
  visaCard,
} from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const AT = '2026-12-04T03:00:00.000Z';

const pending = invoiceSummaryFixture({
  id: '64b0000000000000000000c1',
  number: 'HD-2026-000011',
  status: 'pending',
  method: 'transfer',
  card: null,
  paidAt: null,
  payable: true,
  lastAttempt: null,
  amount: 599_000,
  planId: 'agency',
  planName: 'Agency',
  periodStart: AT,
  periodEnd: '2027-01-03T03:00:00.000Z',
});
const { card: _card, ...due } = pending;
const dueInvoice: DueInvoice = { ...due, item: null };
const detail: Invoice = invoiceFixture({
  ...pending,
  endsTrial: false,
  from: null,
  transfer: {
    bankName: 'Ngân hàng thử',
    accountNumber: '0000000000',
    accountName: 'PAYLOAD LANDING PAGE',
    content: 'PLP HD-2026-000011',
    amount: 599_000,
    qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
    pageUrl: null,
    startedAt: '2026-11-27T03:00:00.000Z',
  },
});

function renewalOf(overrides: Partial<SubscriptionRenewal> = {}): SubscriptionRenewal {
  return {
    at: AT,
    planId: 'agency',
    planName: 'Agency',
    cycle: 'monthly',
    amount: 599_000,
    autoRenews: false,
    blocker: null,
    method: 'transfer',
    invoiceAt: '2026-11-27T03:00:00.000Z',
    invoice: null,
    paid: false,
    ...overrides,
  };
}

const activeSummary = (overrides: Parameters<typeof summaryFixture>[0] = {}) =>
  summaryFixture({
    state: 'active',
    renewalMethod: 'transfer',
    periodStart: '2026-11-04T03:00:00.000Z',
    periodEnd: AT,
    trialEndsAt: null,
    trialDaysLeft: null,
    ...overrides,
  });

function renderPayments(
  summary = activeSummary(),
  overrides: Partial<PaymentsScreenProps['initial']> = {},
) {
  return renderWithProviders(
    <PaymentsScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      initial={{
        summary,
        paymentMethod: { paymentMethod: visaCard, paymentsEnabled: true },
        billingInfo: { billingInfo: null },
        invoices: { items: [], nextCursor: null },
        loadedAt: Date.now(),
        ...overrides,
      }}
      returned={null}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.getInvoice
      ? Promise.resolve(detail)
      : Promise.reject(new Error('unexpected call')),
  );
  window.history.replaceState(null, '', '/');
});

describe('"Gia hạn bằng" on board 29 (T4)', () => {
  it('offers the saved card and the bank transfer, with the card chosen by default', () => {
    renderPayments(activeSummary({ renewalMethod: 'card' }));

    const group = screen.getByRole('group', { name: 'Gia hạn bằng' });
    expect(within(group).getByRole('radio', { name: 'Thẻ thanh toán tự động' })).toBeChecked();
    const transfer = within(group).getByRole('radio', { name: 'Chuyển khoản ngân hàng' });
    expect(transfer).not.toBeChecked();
    expect(transfer).toHaveAccessibleDescription(/mã QR gửi qua email trước ngày cuối kỳ/);
    expect(screen.queryByText(/không tự gia hạn/)).toBeNull();
  });

  it('sets the method and says when the invoice is sent', async () => {
    const user = userEvent.setup();
    const after = activeSummary({ renewal: renewalOf({ invoiceAt: '2026-11-27T03:00:00.000Z' }) });
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.setRenewalMethod) {
        return Promise.resolve(after);
      }
      if (endpoint === endpoints.listInvoices) {
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderPayments(activeSummary({ renewalMethod: 'card' }));

    await user.click(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' }));

    expect(lastCallTo(apiMock, endpoints.setRenewalMethod)).toMatchObject({
      args: [WORKSPACE_ID],
      options: { body: { method: 'transfer' } },
    });
    expect(await screen.findByText('Gia hạn bằng chuyển khoản ngân hàng')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' })).toBeChecked();
    expect(
      screen.getByText(
        'Hóa đơn kỳ sau (599.000 ₫) được gửi 27/11/2026, hạn chuyển khoản 04/12/2026.',
      ),
    ).toBeInTheDocument();
  });

  it('leads to "Thêm thẻ" instead of asking for the card when none can pay', async () => {
    const user = userEvent.setup();
    renderPayments(activeSummary(), {
      paymentMethod: { paymentMethod: null, paymentsEnabled: true },
    });

    await user.click(screen.getByRole('radio', { name: 'Thẻ thanh toán tự động' }));

    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.setRenewalMethod,
      expect.anything(),
      expect.anything(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cần thêm thẻ để gia hạn bằng thẻ');
    expect(screen.getByRole('button', { name: 'Thêm thẻ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' })).toBeChecked();
  });

  it('shows the same offer when the API refuses the card with 422', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(apiError(422, 'payment_method_required', 'Thẻ đã lưu đã hết hạn'));
    renderPayments();

    await user.click(screen.getByRole('radio', { name: 'Thẻ thanh toán tự động' }));

    expect(await screen.findByRole('button', { name: 'Thêm thẻ' })).toBeInTheDocument();
  });

  it('is disabled while the gateway is off, "Thêm thẻ" too', () => {
    renderPayments(activeSummary({ renewalMethod: 'card' }), {
      paymentMethod: { paymentMethod: null, paymentsEnabled: false },
    });
    expect(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' })).toBeDisabled();
    expect(screen.getByText('Cần thêm thẻ để gia hạn bằng thẻ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm thẻ' })).toBeDisabled();
  });

  it('keeps the focus on the radio the keyboard chose while the choice is saved', async () => {
    const user = userEvent.setup();
    let answer: (summary: BillingSummary) => void = () => undefined;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.setRenewalMethod) {
        return new Promise((resolve) => {
          answer = resolve;
        });
      }
      if (endpoint === endpoints.listInvoices) {
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderPayments(activeSummary({ renewalMethod: 'card' }));
    const card = screen.getByRole('radio', { name: 'Thẻ thanh toán tự động' });
    const transfer = screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' });
    card.focus();

    await user.keyboard('{ArrowRight}');
    expect(transfer).toHaveFocus();
    expect(transfer).toBeEnabled();
    expect(transfer).toBeChecked();
    // Another choice while the first is saved waits for its answer.
    await user.keyboard('{ArrowLeft}');
    expect(card).toHaveFocus();
    expect(transfer).toBeChecked();

    answer(activeSummary({ renewal: renewalOf() }));
    expect(await screen.findByText('Gia hạn bằng chuyển khoản ngân hàng')).toBeInTheDocument();
    expect(card).toHaveFocus();
    expect(transfer).toBeChecked();
    expect(
      apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.setRenewalMethod),
    ).toHaveLength(1);
  });

  it('says when the invoice comes once, in the line under the choice', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.setRenewalMethod) {
        return Promise.resolve(activeSummary({ renewal: renewalOf() }));
      }
      if (endpoint === endpoints.listInvoices) {
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderPayments(activeSummary({ renewalMethod: 'card' }));

    await user.click(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' }));

    expect(await screen.findByText('Gia hạn bằng chuyển khoản ngân hàng')).toBeInTheDocument();
    expect(screen.getAllByText(/27\/11\/2026/)).toHaveLength(1);
  });
});

describe('the renewal invoice on board 29 (T4)', () => {
  it('names the early invoice, with its bank details and a card alternative', async () => {
    const user = userEvent.setup();
    renderPayments(activeSummary({ renewal: renewalOf({ invoice: dueInvoice }) }));

    expect(
      screen.getByText(
        'Hóa đơn gia hạn HD-2026-000011 · 599.000 ₫ · chuyển khoản trước 04/12/2026',
      ),
    ).toBeInTheDocument();
    const details = await screen.findByRole('region', {
      name: 'Chuyển khoản hóa đơn gia hạn HD-2026-000011',
    });
    expect(await within(details).findByText('PLP HD-2026-000011')).toBeInTheDocument();
    expect(details).toHaveAttribute('id', 'chuyen-khoan');
    // The banner carries the one card button; the details card has none of its own.
    expect(screen.getAllByRole('button', { name: 'Thanh toán bằng thẻ thay thế' })).toHaveLength(1);

    apiMock.mockImplementation((endpoint) => {
      switch (endpoint) {
        case endpoints.payInvoice:
          return Promise.resolve({ invoice: { ...detail, status: 'paid' } });
        case endpoints.listInvoices:
          return Promise.resolve({ items: [], nextCursor: null });
        case endpoints.getInvoice:
          return Promise.resolve(detail);
        default:
          return Promise.reject(new Error('unexpected call'));
      }
    });
    await user.click(screen.getByRole('button', { name: 'Thanh toán bằng thẻ thay thế' }));
    expect(lastCallTo(apiMock, endpoints.payInvoice).args).toEqual([WORKSPACE_ID, pending.id]);
  });

  it('moves focus to the bank details from "Xem thông tin chuyển khoản"', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    renderPayments(activeSummary({ renewal: renewalOf({ invoice: dueInvoice }) }));
    const region = await screen.findByRole('region', {
      name: 'Chuyển khoản hóa đơn gia hạn HD-2026-000011',
    });

    await user.click(screen.getByRole('button', { name: 'Xem thông tin chuyển khoản' }));

    expect(region).toHaveFocus();
  });

  it('says "Chờ chuyển khoản" with the deadline in the grace, not a failed payment', async () => {
    renderPayments(
      activeSummary({
        state: 'pending_payment',
        awaitingTransfer: true,
        dueInvoice,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
      }),
    );

    const banner = screen.getByText('Chờ chuyển khoản hóa đơn HD-2026-000011').closest('div');
    expect(banner).toHaveTextContent('Chuyển khoản trước 11/12/2026');
    expect(screen.queryByText(/không thành công/)).toBeNull();
    expect(screen.queryByText(/thử lại/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Xem thông tin chuyển khoản' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thanh toán bằng thẻ thay thế' }),
    ).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Chuyển khoản hóa đơn gia hạn HD-2026-000011' });
  });

  it('says read-only once the grace ended, and that a transfer reopens it, as an alert', () => {
    renderPayments(
      activeSummary({
        state: 'pending_payment',
        access: 'read_only',
        awaitingTransfer: true,
        dueInvoice,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Chờ chuyển khoản hóa đơn HD-2026-000011.*Workspace mở lại khi nhận được chuyển khoản/,
    );
    // Said once, in the renewal banner.
    expect(screen.queryByText('Workspace đang ở chế độ chỉ đọc')).toBeNull();
  });

  it('leads to "Thêm thẻ" in place of the card when none is saved, and the history agrees', async () => {
    renderPayments(
      activeSummary({
        state: 'pending_payment',
        awaitingTransfer: true,
        dueInvoice,
        graceEndsAt: '2026-12-11T03:00:00.000Z',
      }),
      {
        paymentMethod: { paymentMethod: null, paymentsEnabled: true },
        invoices: { items: [pending], nextCursor: null },
      },
    );

    const addCard = screen.getByRole('button', { name: 'Thêm thẻ' });
    expect(addCard).toHaveAccessibleDescription(
      'Muốn thanh toán bằng thẻ thay thế, thêm thẻ trước.',
    );
    expect(screen.queryByRole('button', { name: 'Thanh toán bằng thẻ thay thế' })).toBeNull();
    // The history row offers no card payment either: there is no card to pay with.
    const history = screen.getByRole('table', { name: 'Lịch sử giao dịch' });
    expect(within(history).getByText('Chờ nhận chuyển khoản')).toBeInTheDocument();
    expect(within(history).queryByRole('button', { name: /Thanh toán bằng thẻ/ })).toBeNull();
    await screen.findByRole('region', { name: 'Chuyển khoản hóa đơn gia hạn HD-2026-000011' });
  });

  it('says a paid next period starts with no lost day', () => {
    renderPayments(
      activeSummary({
        renewal: renewalOf({ paid: true, invoice: { ...dueInvoice, status: 'paid' } }),
      }),
    );
    expect(screen.getByText('Kỳ sau đã được thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/không bị trừ tiền lần nữa/)).toBeInTheDocument();
  });
});

describe('CancelPlanDialog with an early renewal invoice (T4)', () => {
  it('says the transfer details stop working', () => {
    renderWithProviders(
      <CancelPlanDialog
        summary={activeSummary({ renewal: renewalOf({ invoice: dueInvoice }) })}
        open
        onOpenChange={() => undefined}
        pending={false}
        error={null}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Thông tin chuyển khoản của hóa đơn HD-2026-000011 không còn dùng được.',
    );
  });
});

describe('"Đổi gói" with an early renewal invoice (T4)', () => {
  const voided = { invoiceId: pending.id, invoiceNumber: pending.number };

  function renderBilling(summary: ReturnType<typeof summaryFixture>) {
    return renderWithProviders(
      <BillingScreen
        workspaceId={WORKSPACE_ID}
        workspaceName="Mây Xanh Agency"
        canManage
        initial={summary}
        catalog={catalog}
        loadedAt={Date.now()}
      />,
    );
  }

  function answerQuotes(
    free: ReturnType<typeof quoteFixture>,
    paid?: ReturnType<typeof quoteFixture>,
  ) {
    apiMock.mockImplementation((endpoint, _args, options) => {
      if (endpoint === endpoints.getPlanChangeQuote) {
        const query = (options as { query: { payNow: string } }).query;
        const quote = query.payNow === 'true' ? paid : free;
        return quote === undefined ? Promise.reject(new Error('no quote')) : Promise.resolve(quote);
      }
      return Promise.reject(new Error('unexpected call'));
    });
  }

  it('warns before a scheduled downgrade that the old transfer details stop working', async () => {
    const user = userEvent.setup();
    answerQuotes(
      quoteFixture({
        mode: 'scheduled',
        planId: 'basic',
        effectiveAt: AT,
        nextAmount: 199_000,
        renewalInvoiceVoided: voided,
      }),
    );
    renderBilling(activeSummary({ renewal: renewalOf({ invoice: dueInvoice }) }));

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));

    expect(
      await within(dialog).findByText('Hóa đơn chuyển khoản đang chờ sẽ bị thay'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Thông tin chuyển khoản của hóa đơn HD-2026-000011 không còn dùng được; hóa đơn mới sẽ được gửi.',
    );
  });

  it('tells a trial the notice of each of its two choices', async () => {
    const user = userEvent.setup();
    answerQuotes(
      quoteFixture({ planId: 'basic', renewalInvoiceVoided: voided }),
      quoteFixture({
        mode: 'start_paid',
        planId: 'basic',
        amount: 199_000,
        paymentMethod: visaCard,
        renewalInvoiceVoided: voided,
      }),
    );
    renderBilling(
      summaryFixture({ renewalMethod: 'transfer', renewal: renewalOf({ invoice: dueInvoice }) }),
    );

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));

    expect(
      await within(dialog).findByText(/Nếu đổi miễn phí: Thông tin chuyển khoản/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Nếu thanh toán ngay: Thông tin chuyển khoản/),
    ).toBeInTheDocument();
  });

  it('shows nothing when no invoice is voided', async () => {
    const user = userEvent.setup();
    answerQuotes(quoteFixture({ mode: 'scheduled', planId: 'basic', effectiveAt: AT }));
    renderBilling(activeSummary());

    await user.click(screen.getByRole('button', { name: 'Đổi gói' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi gói' });
    await user.click(within(dialog).getByRole('radio', { name: /Gói Cơ bản/ }));
    await within(dialog).findByRole('button', { name: 'Lên lịch hạ gói' });

    expect(within(dialog).queryByText('Hóa đơn chuyển khoản đang chờ sẽ bị thay')).toBeNull();
  });
});

describe('board 28 with a transfer renewal (T4)', () => {
  it('leads the banner to the bank details on board 29', () => {
    renderWithProviders(
      <BillingScreen
        workspaceId={WORKSPACE_ID}
        workspaceName="Mây Xanh Agency"
        canManage
        initial={activeSummary({ renewal: renewalOf({ invoice: dueInvoice }) })}
        catalog={catalog}
        loadedAt={Date.now()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Xem thông tin chuyển khoản' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments#chuyen-khoan`,
    );
    expect(screen.getByText(/gia hạn 04\/12\/2026 · chuyển khoản 599.000 ₫/)).toBeInTheDocument();
  });

  it('hides "Hủy gói" and explains while the next period is paid', () => {
    renderWithProviders(
      <BillingScreen
        workspaceId={WORKSPACE_ID}
        workspaceName="Mây Xanh Agency"
        canManage
        initial={activeSummary({
          renewal: renewalOf({ paid: true, invoice: { ...dueInvoice, status: 'paid' } }),
        })}
        catalog={catalog}
        loadedAt={Date.now()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Hủy gói' })).toBeNull();
    expect(
      screen.getByText('Kỳ sau đã thanh toán nên đổi gói và hủy gói được từ 04/12/2026.'),
    ).toBeInTheDocument();
  });
});

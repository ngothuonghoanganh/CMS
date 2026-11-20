import { endpoints, type ErrorCode } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-core';
import { navigateTo } from '../../lib/navigate';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { PaymentsDenied, PaymentsScreen, type PaymentsScreenProps } from './PaymentsScreen';
import { invoiceSummaryFixture, visaCard } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));
vi.mock(import('../../lib/navigate'), () => ({ navigateTo: vi.fn() }));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const paid = invoiceSummaryFixture();
const failed = invoiceSummaryFixture({
  id: '64b0000000000000000000b2',
  number: 'HD-2026-000002',
  status: 'failed',
  paidAt: null,
  payable: true,
  lastAttempt: {
    number: 1,
    at: '2026-11-21T04:00:00.000Z',
    outcome: 'failed',
    code: 'insufficient_funds',
  },
});

function initialOf(overrides: Partial<PaymentsScreenProps['initial']> = {}) {
  return {
    paymentMethod: { paymentMethod: visaCard, paymentsEnabled: true },
    billingInfo: { billingInfo: null },
    invoices: { items: [paid], nextCursor: null },
    loadedAt: Date.now(),
    ...overrides,
  };
}

function renderPayments(overrides: Partial<PaymentsScreenProps> = {}) {
  return renderWithProviders(
    <PaymentsScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      initial={initialOf()}
      returned={null}
      {...overrides}
    />,
  );
}

/** Answers the pay call with `onPay`, and every read again with what the screen already shows. */
function routePay(items: unknown[], onPay: (options: Parameters<typeof api>[2]) => unknown) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.payInvoice) {
      // A throw inside the executor rejects the promise: how a test says a refused charge.
      return new Promise((resolve) => {
        resolve(onPay(options));
      });
    }
    if (endpoint === endpoints.listInvoices) {
      return Promise.resolve({ items, nextCursor: null });
    }
    if (endpoint === endpoints.getPaymentMethod) {
      return Promise.resolve({ paymentMethod: visaCard, paymentsEnabled: true });
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function problem(status: number, code: ErrorCode, context: Record<string, unknown>) {
  return new ApiError(status, { type: 'about:blank', title: 'Lỗi', status, code, context });
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
  vi.mocked(navigateTo).mockReset();
  window.history.replaceState(null, '', '/');
});

describe('PaymentsScreen (board 29)', () => {
  it('shows the saved card, the empty billing info and the history', () => {
    renderPayments();

    expect(screen.getByText('Thẻ Visa •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Hết hạn 08/2030')).toBeInTheDocument();
    expect(screen.getByText('MẶC ĐỊNH')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhập thông tin' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(row).toHaveTextContent('21/11/2026');
    expect(row).toHaveTextContent('Gói Doanh nghiệp · kỳ 21/11/2026 – 21/12/2026');
    expect(row).toHaveTextContent('HD-2026-000001 · Thẻ Visa •••• 4242');
    expect(row).toHaveTextContent('1.490.000 ₫');
    expect(within(row).getByText('Đã thanh toán')).toBeInTheDocument();
  });

  it('opens the receipt of a paid invoice in its own page', () => {
    renderPayments();

    const link = screen.getByRole('link', { name: 'Tải hóa đơn HD-2026-000001' });
    expect(link).toHaveAttribute('href', `/workspaces/${WORKSPACE_ID}/billing/receipts/${paid.id}`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('has the two tabs, on the payments one', () => {
    renderPayments();

    expect(screen.getByRole('link', { name: 'Thanh toán & hóa đơn' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('empty history says so', () => {
    renderPayments({ initial: initialOf({ invoices: { items: [], nextCursor: null } }) });

    expect(screen.getByText('Chưa có giao dịch')).toBeInTheDocument();
  });

  it('loads the next page of the history', async () => {
    const user = userEvent.setup();
    const older = invoiceSummaryFixture({
      id: '64b0000000000000000000b3',
      number: 'HD-2026-000000',
      createdAt: '2026-10-21T03:00:00.000Z',
      paidAt: '2026-10-21T03:00:05.000Z',
    });
    apiMock.mockResolvedValue({ items: [older], nextCursor: null });
    renderPayments({ initial: initialOf({ invoices: { items: [paid], nextCursor: 'c1' } }) });

    await user.click(screen.getByRole('button', { name: 'Xem thêm' }));

    expect(await screen.findByText(/HD-2026-000000/)).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.listInvoices).options).toMatchObject({
      query: { cursor: 'c1' },
    });
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });

  describe('the card', () => {
    it('adds one through the gateway, which leads back to this screen', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValue({ url: 'https://gateway.test/setup?session=abc' });
      renderPayments({
        initial: initialOf({ paymentMethod: { paymentMethod: null, paymentsEnabled: true } }),
      });

      expect(screen.getByText('Chưa có phương thức thanh toán.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Thêm phương thức' }));

      expect(lastCallTo(apiMock, endpoints.startPaymentMethodSetup).options).toEqual({
        body: { returnTo: 'payments' },
      });
      await vi.waitFor(() => {
        expect(navigateTo).toHaveBeenCalledWith('https://gateway.test/setup?session=abc');
      });
    });

    it('replaces the saved one with "Đổi thẻ"', () => {
      renderPayments();

      expect(screen.getByRole('button', { name: 'Đổi thẻ' })).toBeEnabled();
    });

    it('says when the gateway is not set up, and offers no card', () => {
      renderPayments({
        initial: initialOf({ paymentMethod: { paymentMethod: null, paymentsEnabled: false } }),
      });

      expect(screen.getByText('Thanh toán chưa được bật')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Thêm phương thức' })).toBeDisabled();
    });

    it('marks a card past its expiry', () => {
      renderPayments({
        initial: initialOf({
          paymentMethod: { paymentMethod: { ...visaCard, expired: true }, paymentsEnabled: true },
        }),
      });

      expect(screen.getByText('Đã hết hạn 08/2030. Đổi thẻ để thanh toán.')).toBeInTheDocument();
    });
  });

  describe('coming back from the gateway', () => {
    it('confirms the saved card and drops the parameter from the address', () => {
      window.history.replaceState(
        null,
        '',
        `/workspaces/${WORKSPACE_ID}/billing/payments?paymentMethod=saved`,
      );
      renderPayments({ returned: 'saved' });

      expect(screen.getByText('Đã lưu thẻ')).toBeInTheDocument();
      expect(window.location.search).toBe('');
    });

    it('waits for the gateway when the card has not arrived, and reads again on request', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValue({ paymentMethod: visaCard, paymentsEnabled: true });
      renderPayments({
        returned: 'saved',
        initial: initialOf({ paymentMethod: { paymentMethod: null, paymentsEnabled: true } }),
      });

      expect(screen.getByText('Đang chờ cổng thanh toán xác nhận thẻ')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Tải lại' }));

      expect(await screen.findByText('Đã lưu thẻ')).toBeInTheDocument();
      expect(screen.getAllByText('Thẻ Visa •••• 4242').length).toBeGreaterThan(0);
    });

    it('says the card was not added when the owner left the gateway', () => {
      renderPayments({ returned: 'canceled' });

      expect(screen.getByText('Chưa thêm thẻ')).toBeInTheDocument();
    });
  });

  describe('billing info', () => {
    const info = {
      companyName: 'Công ty TNHH Truyền thông Mây Xanh',
      taxCode: '0315123456',
      address: '12 Nguyễn Đình Chiểu, TP. Hồ Chí Minh',
      email: 'ketoan@mayxanh.vn',
    };

    it('shows what was saved', () => {
      renderPayments({ initial: initialOf({ billingInfo: { billingInfo: info } }) });

      expect(screen.getByText('Công ty TNHH Truyền thông Mây Xanh')).toBeInTheDocument();
      expect(screen.getByText('0315123456')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    });

    it('counts the digits of a short tax code and keeps the form open', async () => {
      const user = userEvent.setup();
      renderPayments({ initial: initialOf({ billingInfo: { billingInfo: info } }) });

      await user.click(screen.getByRole('button', { name: 'Sửa' }));
      const tax = screen.getByLabelText(/Mã số thuế/);
      await user.clear(tax);
      await user.type(tax, '0315 123 45');
      await user.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Mã số thuế gồm 10 hoặc 13 chữ số. Hiện có 9.')).toBeVisible();
      expect(tax).toHaveAttribute('aria-invalid', 'true');
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('saves it, and says it applies to the next invoices', async () => {
      const user = userEvent.setup();
      apiMock.mockResolvedValue({ billingInfo: { ...info, taxCode: '0315123456-001' } });
      renderPayments();

      await user.click(screen.getByRole('button', { name: 'Nhập thông tin' }));
      expect(screen.getByText(/áp dụng cho hóa đơn từ kỳ sau/)).toBeInTheDocument();
      await user.type(screen.getByLabelText(/Tên đơn vị/), info.companyName);
      await user.type(screen.getByLabelText(/Mã số thuế/), '0315123456001');
      await user.type(screen.getByLabelText(/Địa chỉ/), info.address);
      await user.type(screen.getByLabelText(/Email nhận hóa đơn/), info.email);
      await user.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(lastCallTo(apiMock, endpoints.updateBillingInfo).options).toMatchObject({
        body: { companyName: info.companyName, taxCode: '0315123456-001', email: info.email },
      });
      expect(await screen.findByText('Đã lưu thông tin xuất hóa đơn')).toBeInTheDocument();
      expect(screen.getByText('0315123456-001')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull();
    });

    it("shows the API's message on the field it refused", async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValue(
        apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
          { path: ['taxCode'], code: 'custom', message: 'Mã số thuế này không hợp lệ' },
        ]),
      );
      renderPayments({ initial: initialOf({ billingInfo: { billingInfo: info } }) });

      await user.click(screen.getByRole('button', { name: 'Sửa' }));
      await user.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Mã số thuế này không hợp lệ')).toBeVisible();
    });
  });

  describe('"Thanh toán lại"', () => {
    it('charges the failed invoice with a key of its own, and says it paid', async () => {
      const user = userEvent.setup();
      routePay([failed, paid], () => ({
        invoice: {
          ...paid,
          id: failed.id,
          number: failed.number,
          attempts: [],
          billingInfo: null,
          from: null,
          endsTrial: false,
        },
      }));
      renderPayments({
        initial: initialOf({ invoices: { items: [failed, paid], nextCursor: null } }),
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Thanh toán hóa đơn HD-2026-000002 không thành công.',
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Thẻ không đủ hạn mức •••• 4242');
      await user.click(
        screen.getByRole('button', { name: 'Thanh toán lại hóa đơn HD-2026-000002' }),
      );

      const call = lastCallTo(apiMock, endpoints.payInvoice);
      expect(call.args).toEqual([WORKSPACE_ID, failed.id]);
      const key = (call.options as { headers: Record<string, string> }).headers['Idempotency-Key'];
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      expect(await screen.findByText('Đã thanh toán 1.490.000 ₫')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Thanh toán lại hóa đơn HD-2026-000002' }),
      );
      const second = (
        lastCallTo(apiMock, endpoints.payInvoice).options as { headers: Record<string, string> }
      ).headers['Idempotency-Key'];
      expect(second).not.toBe(key);
    });

    it('is offered only for an invoice that can be paid', () => {
      renderPayments({
        initial: initialOf({
          invoices: {
            items: [{ ...failed, payable: false, status: 'void' }, paid],
            nextCursor: null,
          },
        }),
      });

      expect(screen.queryByRole('button', { name: /Thanh toán lại/ })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the gateway reason when it fails again', async () => {
      const user = userEvent.setup();
      routePay([failed], () => {
        throw problem(402, 'payment_failed', {
          invoiceId: failed.id,
          invoiceNumber: failed.number,
          code: 'card_declined',
        });
      });
      renderPayments({ initial: initialOf({ invoices: { items: [failed], nextCursor: null } }) });

      await user.click(
        screen.getByRole('button', { name: 'Thanh toán lại hóa đơn HD-2026-000002' }),
      );

      expect(await screen.findByText('Thanh toán không thành công')).toBeInTheDocument();
      expect(
        screen.getByText('Ngân hàng từ chối thẻ. Hóa đơn HD-2026-000002 chưa được thanh toán.'),
      ).toBeInTheDocument();
    });

    it('says "Đang xử lý" for an answer that is not final (202)', async () => {
      const user = userEvent.setup();
      routePay([failed], (options) => {
        options?.onStatus?.(202);
        return {
          invoice: {
            ...failed,
            status: 'pending',
            attempts: [],
            billingInfo: null,
            from: null,
            endsTrial: false,
          },
        };
      });
      renderPayments({ initial: initialOf({ invoices: { items: [failed], nextCursor: null } }) });

      await user.click(
        screen.getByRole('button', { name: 'Thanh toán lại hóa đơn HD-2026-000002' }),
      );

      expect(await screen.findByText('Đang xử lý thanh toán')).toBeInTheDocument();
    });

    it('stays usable when the workspace is read-only: paying is how it stops being', () => {
      // Nothing on the screen reads the access level.
      renderPayments({ initial: initialOf({ invoices: { items: [failed], nextCursor: null } }) });

      expect(
        screen.getByRole('button', { name: 'Thanh toán lại hóa đơn HD-2026-000002' }),
      ).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Đổi thẻ' })).toBeEnabled();
    });
  });
});

describe('PaymentsDenied', () => {
  it('tells Quản trị that only Chủ sở hữu sees payments', () => {
    renderWithProviders(
      <PaymentsDenied workspaceId={WORKSPACE_ID} roleLabel="Quản trị" holders="Chủ sở hữu" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Chỉ Chủ sở hữu xem được thanh toán' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Bạn là Quản trị nên vẫn xem được gói và mức sử dụng/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem gói & mức dùng' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing`,
    );
    expect(apiMock).not.toHaveBeenCalled();
  });
});

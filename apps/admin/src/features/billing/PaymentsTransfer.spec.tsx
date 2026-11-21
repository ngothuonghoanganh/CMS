import { endpoints, type Invoice } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { PaymentsScreen, type PaymentsScreenProps } from './PaymentsScreen';
import { invoiceFixture, invoiceSummaryFixture, summaryFixture, visaCard } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const { card: _card, ...dueOf } = invoiceSummaryFixture({
  id: '64b0000000000000000000b2',
  number: 'HD-2026-000002',
  status: 'failed',
  paidAt: null,
  payable: true,
  lastAttempt: {
    number: 1,
    at: '2026-12-01T03:00:00.000Z',
    outcome: 'failed',
    code: 'insufficient_funds',
  },
});
const failed = invoiceSummaryFixture({
  id: dueOf.id,
  number: dueOf.number,
  status: 'failed',
  paidAt: null,
  payable: true,
  lastAttempt: dueOf.lastAttempt,
});
const waiting = invoiceSummaryFixture({
  id: dueOf.id,
  number: dueOf.number,
  status: 'pending',
  method: 'transfer',
  card: null,
  paidAt: null,
  payable: true,
  lastAttempt: null,
});
const waitingDetail: Invoice = invoiceFixture({
  ...waiting,
  endsTrial: false,
  from: null,
  transfer: {
    bankName: 'Ngân hàng thử (cổng thanh toán giả)',
    accountNumber: '0000000000',
    accountName: 'PAYLOAD LANDING PAGE',
    content: 'PLP HD-2026-000002',
    amount: 1_490_000,
    qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
    pageUrl: 'https://admin.test/api/public/billing/fake-gateway/transfer?session=abc',
    startedAt: '2026-12-02T03:00:00.000Z',
  },
});

function renderPayments(overrides: Partial<PaymentsScreenProps> = {}, items = [failed]) {
  return renderWithProviders(
    <PaymentsScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      initial={{
        summary: summaryFixture({
          state: 'past_due',
          dueInvoice: dueOf,
          failedSince: '2026-12-01T03:00:00.000Z',
          nextRetryAt: '2026-12-03T03:00:00.000Z',
          graceEndsAt: '2026-12-08T03:00:00.000Z',
        }),
        paymentMethod: { paymentMethod: visaCard, paymentsEnabled: true },
        billingInfo: { billingInfo: null },
        invoices: { items, nextCursor: null },
        loadedAt: Date.now(),
      }}
      returned={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
  window.history.replaceState(null, '', '/');
});

describe('the failed payment banner (board 29)', () => {
  it('says when the system tries again, and when the workspace turns read-only', () => {
    renderPayments();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Thanh toán hóa đơn HD-2026-000002 không thành công.');
    expect(alert).toHaveTextContent('Thẻ không đủ hạn mức');
    expect(alert).toHaveTextContent('Hệ thống tự thử lại ngày 03/12.');
    expect(alert).toHaveTextContent('chỉ đọc từ 08/12/2026');
    expect(alert).toHaveTextContent('Bạn có thể đổi thẻ hoặc chuyển khoản ngay.');
  });

  it('says no automatic try is left once the retries are used', () => {
    renderPayments({
      initial: {
        summary: summaryFixture({
          state: 'past_due',
          dueInvoice: dueOf,
          failedSince: '2026-12-01T03:00:00.000Z',
          nextRetryAt: null,
        }),
        paymentMethod: { paymentMethod: visaCard, paymentsEnabled: true },
        billingInfo: { billingInfo: null },
        invoices: { items: [failed], nextCursor: null },
        loadedAt: Date.now(),
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Hệ thống đã hết lượt tự thử lại.');
  });

  it('says the workspace is read-only once the grace is over, since the shell does not here', () => {
    renderPayments({
      initial: {
        summary: summaryFixture({
          state: 'past_due',
          access: 'read_only',
          dueInvoice: dueOf,
          failedSince: '2026-12-01T03:00:00.000Z',
          nextRetryAt: null,
          graceEndsAt: '2026-12-08T03:00:00.000Z',
        }),
        paymentMethod: { paymentMethod: visaCard, paymentsEnabled: true },
        billingInfo: { billingInfo: null },
        invoices: { items: [failed], nextCursor: null },
        loadedAt: Date.now(),
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Workspace đang ở chế độ chỉ đọc; thanh toán để mở lại việc chỉnh sửa.',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says why a stopped plan is read-only, with no invoice to pay', () => {
    renderPayments(
      {
        initial: {
          summary: summaryFixture({ state: 'trial_expired', access: 'read_only' }),
          paymentMethod: { paymentMethod: null, paymentsEnabled: true },
          billingInfo: { billingInfo: null },
          invoices: { items: [], nextCursor: null },
          loadedAt: Date.now(),
        },
      },
      [],
    );

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Workspace đang ở chế độ chỉ đọc');
    expect(notice).toHaveTextContent('Thời gian dùng thử đã hết.');
    expect(notice).toHaveTextContent('Chọn gói ở "Gói & mức dùng"');
  });

  it('asks for the bank details, and shows them with the invoice as awaiting', async () => {
    const user = userEvent.setup();
    let started = false;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.startInvoiceTransfer) {
        started = true;
        return Promise.resolve({ invoice: waitingDetail });
      }
      if (endpoint === endpoints.listInvoices) {
        return Promise.resolve({ items: started ? [waiting] : [failed], nextCursor: null });
      }
      if (endpoint === endpoints.getBillingSummary) {
        return Promise.resolve(summaryFixture({ state: 'pending_payment' }));
      }
      if (endpoint === endpoints.getPaymentMethod) {
        return Promise.resolve({ paymentMethod: visaCard, paymentsEnabled: true });
      }
      if (endpoint === endpoints.getInvoice) {
        return Promise.resolve(waitingDetail);
      }
      if (endpoint === endpoints.getBillingInfo) {
        return Promise.resolve({ billingInfo: null });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderPayments();

    await user.click(screen.getByRole('button', { name: 'Chuyển khoản' }));

    expect(lastCallTo(apiMock, endpoints.startInvoiceTransfer).args).toEqual([
      WORKSPACE_ID,
      failed.id,
    ]);
    const card = await screen.findByRole('region', { name: 'Chuyển khoản hóa đơn HD-2026-000002' });
    expect(within(card).getByText('Đang chờ xác nhận')).toBeInTheDocument();
    expect(card).toHaveTextContent('Ngân hàng thử (cổng thanh toán giả)');
    expect(card).toHaveTextContent('0000000000');
    expect(card).toHaveTextContent('PAYLOAD LANDING PAGE');
    expect(card).toHaveTextContent('1.490.000 ₫');
    expect(card).toHaveTextContent('PLP HD-2026-000002');
    expect(within(card).getByRole('img')).toHaveAttribute(
      'src',
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    expect(within(card).getByRole('link', { name: /Mở trang chuyển khoản/ })).toHaveAttribute(
      'href',
      waitingDetail.transfer?.pageUrl,
    );
    // The failed banner is gone, the history marks the row as waiting for the bank.
    expect(screen.queryByText(/không thành công/)).toBeNull();
    const row = within(screen.getByRole('table', { name: 'Lịch sử giao dịch' })).getAllByRole(
      'row',
    )[1] as HTMLElement;
    expect(row).toHaveTextContent('Đang chờ xác nhận');
    expect(row).toHaveTextContent('Chuyển khoản');
  });

  it('shows the details of a transfer already waiting, and pays by card instead on request', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.getInvoice) {
        return Promise.resolve(waitingDetail);
      }
      if (endpoint === endpoints.payInvoice) {
        return Promise.resolve({ invoice: invoiceFixture({ id: waiting.id }) });
      }
      if (endpoint === endpoints.getPaymentMethod) {
        return Promise.resolve({ paymentMethod: visaCard, paymentsEnabled: true });
      }
      if (endpoint === endpoints.getBillingSummary) {
        return Promise.resolve(summaryFixture({ state: 'active' }));
      }
      if (endpoint === endpoints.getBillingInfo) {
        return Promise.resolve({ billingInfo: null });
      }
      return Promise.resolve({ items: [], nextCursor: null });
    });
    renderPayments({}, [waiting]);

    expect(await screen.findByText('PLP HD-2026-000002')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thanh toán bằng thẻ thay thế' }));

    expect(lastCallTo(apiMock, endpoints.payInvoice).args).toEqual([WORKSPACE_ID, waiting.id]);
  });

  it('copies a detail for the banking app', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(waitingDetail);
    renderPayments({}, [waiting]);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(await screen.findByRole('button', { name: 'Sao chép nội dung' }));
    await user.click(screen.getByRole('button', { name: 'Sao chép số tiền' }));

    expect(writeText).toHaveBeenNthCalledWith(1, 'PLP HD-2026-000002');
    // Digits only: a banking app does not take "1.490.000 ₫".
    expect(writeText).toHaveBeenNthCalledWith(2, '1490000');
    expect(await screen.findByText('Đã sao chép số tiền')).toBeInTheDocument();
  });
});

describe("the return from the gateway's transfer page", () => {
  it('says the transfer arrived, and does not keep the parameter', () => {
    window.history.replaceState(null, '', '/?transfer=received');
    renderPayments({ transferReceived: true }, []);

    expect(screen.getByRole('status')).toHaveTextContent('Đã nhận được chuyển khoản');
    expect(window.location.search).toBe('');
  });
});

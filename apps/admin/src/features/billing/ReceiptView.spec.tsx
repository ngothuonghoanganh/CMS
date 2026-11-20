import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptView } from './ReceiptView';
import { invoiceFixture } from './test-fixtures';

const WORKSPACE_ID = '64b0000000000000000000a1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReceiptView', () => {
  it('shows the paid invoice to the billing info it was made for', () => {
    render(
      <ReceiptView
        workspaceId={WORKSPACE_ID}
        receipt={{
          workspaceName: 'Mây Xanh Agency',
          invoice: invoiceFixture({
            billingInfo: {
              companyName: 'Công ty TNHH Truyền thông Mây Xanh',
              taxCode: '0315123456',
              address: '12 Nguyễn Đình Chiểu, TP. Hồ Chí Minh',
              email: 'ketoan@mayxanh.vn',
            },
          }),
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Biên nhận thanh toán' })).toBeInTheDocument();
    expect(screen.getByText('HD-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Công ty TNHH Truyền thông Mây Xanh')).toBeInTheDocument();
    expect(screen.getByText('Mã số thuế: 0315123456')).toBeInTheDocument();
    expect(screen.getByText('Thẻ Visa •••• 4242')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('1.490.000 ₫')).toHaveLength(2);
    expect(screen.getByText(/không phải hóa đơn điện tử/)).toBeInTheDocument();
  });

  it('names the workspace when no billing info was filled', () => {
    render(
      <ReceiptView
        workspaceId={WORKSPACE_ID}
        receipt={{ workspaceName: 'Mây Xanh Agency', invoice: invoiceFixture() }}
      />,
    );

    expect(screen.getByText('Mây Xanh Agency')).toBeInTheDocument();
    expect(screen.getByText('Workspace Mây Xanh Agency')).toBeInTheDocument();
  });

  it('prints from its own button, and leads back to board 29', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(
      <ReceiptView
        workspaceId={WORKSPACE_ID}
        receipt={{ workspaceName: 'Mây Xanh Agency', invoice: invoiceFixture() }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'In hoặc lưu PDF' }));

    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Về thanh toán & hóa đơn' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
  });
});

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { workspacePlanFixture } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { WorkspacePlanProvider } from './plan-context';
import { PlanBanner } from './PlanBanner';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const expired = workspacePlanFixture({ state: 'trial_expired', access: 'read_only' });

function renderBanner(variant: 'card' | 'strip', canViewBilling = true, plan = expired) {
  return renderWithProviders(
    <WorkspacePlanProvider workspaceId={WORKSPACE_ID} canViewBilling={canViewBilling} plan={plan}>
      <PlanBanner variant={variant} />
    </WorkspacePlanProvider>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
});

describe('PlanBanner (ADR-035)', () => {
  it('says why, what keeps running, and leads to board 28', () => {
    renderBanner('card');
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Workspace đang ở chế độ chỉ đọc');
    expect(banner).toHaveTextContent('Thời gian dùng thử đã hết. Trang live và form vẫn chạy.');
    expect(screen.getByRole('link', { name: 'Xem gói & thanh toán' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing`,
    );
  });

  it('runs across a full-screen editor, saying a change there is not saved', () => {
    renderBanner('strip', false);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Thay đổi ở đây chưa lưu được.');
    expect(banner).toHaveTextContent('Chủ sở hữu workspace cần chọn gói');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says nothing while the plan gives full access', () => {
    renderBanner('card', true, workspacePlanFixture());
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('during the grace of an unpaid period (T3)', () => {
    const pastDue = workspacePlanFixture({ state: 'past_due', access: 'full', graceDaysLeft: 3 });

    it('gives the days to read-only the server counted, and leads to board 28', () => {
      renderBanner('card', true, pastDue);

      const banner = screen.getByRole('status');
      expect(banner).toHaveTextContent('Thanh toán lỗi — còn 3 ngày trước khi chỉ đọc');
      expect(banner).toHaveTextContent('Trang live và form vẫn chạy.');
      expect(screen.getByRole('link', { name: 'Xem gói & thanh toán' })).toHaveAttribute(
        'href',
        `/workspaces/${WORKSPACE_ID}/billing`,
      );
      // No second read, and no clock of the browser: the days come with the plan.
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('waits for a payment to be confirmed, with the same days', () => {
      renderBanner(
        'strip',
        true,
        workspacePlanFixture({ state: 'pending_payment', graceDaysLeft: 5 }),
      );

      expect(screen.getByRole('status')).toHaveTextContent(
        'Đang chờ xác nhận thanh toán — còn 5 ngày trước khi chỉ đọc',
      );
    });

    it('says a failed period whose transfer waits is waiting, not failed', () => {
      renderBanner(
        'card',
        false,
        workspacePlanFixture({ state: 'past_due', graceDaysLeft: 6, paymentWaiting: true }),
      );

      const banner = screen.getByRole('status');
      expect(banner).toHaveTextContent(
        'Đang chờ xác nhận thanh toán — còn 6 ngày trước khi chỉ đọc',
      );
      expect(banner).not.toHaveTextContent('Thanh toán lỗi');
    });

    it('says "Chờ chuyển khoản" for a renewal by bank transfer, then how it reopens (T4)', () => {
      const { unmount } = renderBanner(
        'card',
        true,
        workspacePlanFixture({
          state: 'pending_payment',
          graceDaysLeft: 4,
          awaitingTransfer: true,
        }),
      );
      const banner = screen.getByRole('status');
      expect(banner).toHaveTextContent('Chờ chuyển khoản — còn 4 ngày trước khi chỉ đọc');
      expect(banner).not.toHaveTextContent('Thanh toán lỗi');
      unmount();

      renderBanner(
        'card',
        true,
        workspacePlanFixture({
          state: 'pending_payment',
          access: 'read_only',
          awaitingTransfer: true,
        }),
      );
      const readOnly = screen.getByRole('status');
      expect(readOnly).toHaveTextContent(
        'Workspace mở lại khi nhận được chuyển khoản theo hóa đơn gia hạn.',
      );
      // No payment waits for a confirmation: the transfer never came.
      expect(readOnly).toHaveTextContent('Chưa nhận được chuyển khoản của hóa đơn gia hạn');
      expect(readOnly).not.toHaveTextContent('Thanh toán chưa được xác nhận');
    });

    it('gives the days to every role, and says who acts to one that cannot', () => {
      renderBanner('card', false, pastDue);

      expect(screen.getByRole('status')).toHaveTextContent('Thanh toán lỗi — còn 3 ngày');
      expect(screen.getByRole('status')).toHaveTextContent('Chủ sở hữu workspace cần xử lý');
      expect(screen.queryByRole('link')).toBeNull();
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('is not stacked on the read-only banner: one banner at most', () => {
      renderBanner('card', true, workspacePlanFixture({ state: 'past_due', access: 'read_only' }));

      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('Workspace đang ở chế độ chỉ đọc');
      expect(apiMock).not.toHaveBeenCalled();
    });
  });
});

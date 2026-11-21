import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { workspacePlanFixture } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { WorkspacePlanProvider } from './plan-context';
import { summaryFixture } from './test-fixtures';
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
    const pastDue = workspacePlanFixture({ state: 'past_due', access: 'full' });

    it('counts the days to read-only and leads to board 28', async () => {
      const graceEndsAt = new Date(Date.now() + 2.5 * 86_400_000).toISOString();
      apiMock.mockImplementation((endpoint) =>
        endpoint === endpoints.getBillingSummary
          ? Promise.resolve(summaryFixture({ state: 'past_due', graceEndsAt }))
          : Promise.reject(new Error('unexpected call')),
      );
      renderBanner('card', true, pastDue);

      const banner = await screen.findByRole('status');
      await vi.waitFor(() => {
        expect(banner).toHaveTextContent('Thanh toán lỗi — còn 3 ngày trước khi chỉ đọc');
      });
      expect(banner).toHaveTextContent('Trang live và form vẫn chạy.');
      expect(screen.getByRole('link', { name: 'Xem gói & thanh toán' })).toHaveAttribute(
        'href',
        `/workspaces/${WORKSPACE_ID}/billing`,
      );
    });

    it('waits for a payment to be confirmed, with the same days', async () => {
      const graceEndsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
      apiMock.mockResolvedValue(summaryFixture({ state: 'pending_payment', graceEndsAt }));
      renderBanner('strip', true, workspacePlanFixture({ state: 'pending_payment' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          'Đang chờ xác nhận thanh toán — còn 5 ngày trước khi chỉ đọc',
        );
      });
    });

    it('does not read the billing summary for a role that cannot, and says who acts', () => {
      renderBanner('card', false, pastDue);

      expect(screen.getByRole('status')).toHaveTextContent('Thanh toán lỗi');
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

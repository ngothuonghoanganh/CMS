import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { workspacePlanFixture } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { WorkspacePlanProvider } from './plan-context';
import { ReadOnlyBanner } from './ReadOnlyBanner';

const WORKSPACE_ID = '64b0000000000000000000a1';
const expired = workspacePlanFixture({ state: 'trial_expired', access: 'read_only' });

function renderBanner(variant: 'card' | 'strip', canViewBilling = true, plan = expired) {
  return renderWithProviders(
    <WorkspacePlanProvider workspaceId={WORKSPACE_ID} canViewBilling={canViewBilling} plan={plan}>
      <ReadOnlyBanner variant={variant} />
    </WorkspacePlanProvider>,
  );
}

describe('ReadOnlyBanner (ADR-035)', () => {
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
});

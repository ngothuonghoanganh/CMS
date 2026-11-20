import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { workspacePlanFixture } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { WorkspacePlanProvider } from './plan-context';
import { PlanProblemAction } from './PlanProblemAction';
import { useProblemToast } from './use-problem-toast';

const WORKSPACE_ID = '64b0000000000000000000a1';

function planError(code: 'plan_limit_reached' | 'plan_feature_required' | 'workspace_read_only') {
  const base = apiError(402, code, 'Đã dùng hết hạn mức');
  return new ApiError(402, { ...base.problem, detail: 'Nâng cấp gói để thêm.' });
}

function Failing({ error }: { error: unknown }) {
  const problemToast = useProblemToast(WORKSPACE_ID);
  return (
    <button
      type="button"
      onClick={() => {
        problemToast('Chưa tạo được', error);
      }}
    >
      Thử
    </button>
  );
}

describe('PlanProblemAction', () => {
  it('marks a limit of the plan and leads to board 28', () => {
    renderWithProviders(
      <PlanProblemAction error={planError('plan_limit_reached')} workspaceId={WORKSPACE_ID} />,
    );

    expect(screen.getByText('Theo gói')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nâng cấp' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing`,
    );
  });

  it('calls a read-only workspace by what to open, not "Nâng cấp"', () => {
    renderWithProviders(
      <PlanProblemAction error={planError('workspace_read_only')} workspaceId={WORKSPACE_ID} />,
    );

    expect(screen.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
  });

  it('says nothing for a missing permission or any other error', () => {
    renderWithProviders(
      <>
        <PlanProblemAction
          error={apiError(403, 'forbidden', 'Không có quyền')}
          workspaceId={WORKSPACE_ID}
        />
        <PlanProblemAction error={new TypeError('network')} workspaceId={WORKSPACE_ID} />
      </>,
    );

    expect(screen.queryByText('Theo gói')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('names who can upgrade when the viewer cannot open board 28', () => {
    renderWithProviders(
      <WorkspacePlanProvider
        workspaceId={WORKSPACE_ID}
        canViewBilling={false}
        plan={workspacePlanFixture()}
      >
        <PlanProblemAction error={planError('plan_feature_required')} />
      </WorkspacePlanProvider>,
    );

    expect(screen.getByText('Theo gói')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Chủ sở hữu workspace nâng cấp được.')).toBeInTheDocument();
  });
});

describe('useProblemToast', () => {
  it('warns with "Nâng cấp" for the plan, and keeps a danger toast for anything else', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<Failing error={planError('plan_limit_reached')} />);
    await user.click(screen.getByRole('button', { name: 'Thử' }));
    expect(await screen.findByText('Chưa tạo được')).toBeInTheDocument();
    expect(screen.getByText(/Nâng cấp gói để thêm\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nâng cấp' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing`,
    );
    unmount();

    renderWithProviders(<Failing error={apiError(403, 'forbidden', 'Không có quyền')} />);
    await user.click(screen.getByRole('button', { name: 'Thử' }));
    expect(await screen.findByText('Không có quyền')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nâng cấp' })).toBeNull();
  });
});

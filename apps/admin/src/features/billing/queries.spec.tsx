import { endpoints, type WorkspacePlan } from '@plp/contracts';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { workspacePlanFixture } from '../dashboard/test-fixtures';
import { createTestQueryClient, renderWithProviders } from '../shell/test-utils';
import { useWorkspacePlan, WorkspacePlanProvider } from './plan-context';
import { billingQueryKeys, useBillingSummary } from './queries';
import { summaryFixture } from './test-fixtures';

const navigation = vi.hoisted(() => ({ pathname: '/sites/a' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';

const basicPlan = workspacePlanFixture({
  plan: {
    id: 'basic',
    name: 'Cơ bản',
    limits: { sites: 1, members: 3, aiUses: 20, automationRuns: 0, customDomains: 1 },
    features: { automation: false, customRoles: false },
  },
});
const agencyPlan = workspacePlanFixture();

function PlanName() {
  const frame = useWorkspacePlan();
  return (
    <p>
      {frame?.plan.plan.name} · {frame?.plan.access}
    </p>
  );
}

/** Renders with a query client that a `rerender` keeps. */
function renderFrame(plan: WorkspacePlan, queryClient: QueryClient = createTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = render(frame(plan), { wrapper });
  return {
    rerender: (next: WorkspacePlan) => {
      result.rerender(frame(next));
    },
  };
}

function frame(plan: WorkspacePlan) {
  return (
    <WorkspacePlanProvider workspaceId={WORKSPACE_ID} canViewBilling plan={plan}>
      <PlanName />
    </WorkspacePlanProvider>
  );
}

beforeEach(() => {
  apiMock.mockReset();
  navigation.pathname = '/sites/a';
});

describe('the plan of the frame (ADR-035)', () => {
  it('takes the plan the server rendered over the one an earlier screen cached', () => {
    const queryClient = createTestQueryClient();
    // Another layout cached Cơ bản; the Owner upgraded meanwhile.
    queryClient.setQueryData(billingQueryKeys.plan(WORKSPACE_ID), basicPlan);
    renderFrame(agencyPlan, queryClient);

    expect(screen.getByText('Agency · full')).toBeInTheDocument();
  });

  it('follows the plan when the server renders the frame again', () => {
    const { rerender } = renderFrame(agencyPlan);
    expect(screen.getByText('Agency · full')).toBeInTheDocument();

    rerender(workspacePlanFixture({ state: 'trial_expired', access: 'read_only' }));
    expect(screen.getByText('Agency · read_only')).toBeInTheDocument();
  });

  it('reads the plan again on another screen of the frame', async () => {
    apiMock.mockResolvedValue(
      workspacePlanFixture({ state: 'trial_expired', access: 'read_only' }),
    );
    const { rerender } = renderFrame(agencyPlan);
    expect(apiMock).not.toHaveBeenCalled();

    navigation.pathname = '/sites/a/automations';
    rerender(agencyPlan);
    expect(await screen.findByText('Agency · read_only')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0]?.[0]).toBe(endpoints.getWorkspacePlan);
  });
});

function Usage({ loadedAt }: { loadedAt: number }) {
  const summary = useBillingSummary(
    WORKSPACE_ID,
    summaryFixture({ usage: { ...summaryFixture().usage, sites: 5 } }),
    loadedAt,
  );
  return <p>{summary.usage.sites} site</p>;
}

describe('the summary of board 28', () => {
  it('counts what changed since an earlier visit, from what the server loaded', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(billingQueryKeys.summary(WORKSPACE_ID), summaryFixture(), {
      updatedAt: 1_000,
    });
    renderWithProviders(<Usage loadedAt={2_000} />, queryClient);
    await waitFor(() => {
      expect(screen.getByText('5 site')).toBeInTheDocument();
    });
  });

  it('keeps a newer summary than the one the server loaded', () => {
    const queryClient = createTestQueryClient();
    const now = Date.now();
    queryClient.setQueryData(billingQueryKeys.summary(WORKSPACE_ID), summaryFixture(), {
      updatedAt: now,
    });
    act(() => {
      renderWithProviders(<Usage loadedAt={now - 60_000} />, queryClient);
    });
    expect(screen.getByText('4 site')).toBeInTheDocument();
  });
});

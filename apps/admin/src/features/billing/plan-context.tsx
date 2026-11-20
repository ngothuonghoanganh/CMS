'use client';

import type { WorkspacePlan } from '@plp/contracts';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { billingHref } from '../shell/navigation';
import { useLivePlan, usePlanOnEveryScreen } from './queries';

interface PlanFrame {
  workspaceId: string;
  /** Holds `billing.view`: the only role the "Nâng cấp" link is for. */
  canViewBilling: boolean;
  plan: WorkspacePlan;
}

const PlanContext = createContext<PlanFrame | null>(null);

export interface WorkspacePlanProviderProps extends PlanFrame {
  children: ReactNode;
}

/**
 * The plan of the workspace for every screen inside the shell: the "Theo gói" and "Cần gói" states,
 * and where a 402 sends the user. It follows a change of plan.
 */
export function WorkspacePlanProvider({
  workspaceId,
  canViewBilling,
  plan,
  children,
}: WorkspacePlanProviderProps) {
  const live = useLivePlan(workspaceId, plan);
  usePlanOnEveryScreen(workspaceId);
  const value = useMemo(
    () => ({ workspaceId, canViewBilling, plan: live }),
    [workspaceId, canViewBilling, live],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/** The plan frame, or null outside the shell (a screen rendered on its own). */
export function useWorkspacePlan(): PlanFrame | null {
  return useContext(PlanContext);
}

/**
 * Where "Nâng cấp" goes for this viewer: board 28, or null when they cannot open it. A screen
 * outside the shell (the editor) names its workspace; board 28 then answers for itself.
 */
export function useUpgradeHref(workspaceId?: string): string | null {
  const frame = useContext(PlanContext);
  const id = workspaceId ?? frame?.workspaceId;
  if (id === undefined) {
    return null;
  }
  return frame?.canViewBilling === false ? null : billingHref(id);
}

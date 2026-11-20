import {
  type BillingSummary,
  nextVnMonthStart,
  type PlanUsage,
  type VnMonth,
  type WorkspacePlan,
} from '@plp/contracts';
import type { Entitlements } from './entitlements.service.js';

export function toBillingSummary(
  { plan, facts, status }: Entitlements,
  usage: PlanUsage,
  month: VnMonth,
): BillingSummary {
  return {
    plan,
    cycle: facts.cycle,
    state: status.state,
    access: status.access,
    trialEndsAt: facts.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: status.trialDaysLeft,
    periodStart: facts.periodStart.toISOString(),
    periodEnd: facts.periodEnd.toISOString(),
    cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
    scheduledChange: facts.scheduledChange,
    graceEndsAt: status.graceEndsAt?.toISOString() ?? null,
    usage,
    usageMonth: month,
    usageResetsOn: nextVnMonthStart(month),
  };
}

export function toWorkspacePlan({ plan, status }: Entitlements): WorkspacePlan {
  return {
    plan: { id: plan.id, name: plan.name, limits: plan.limits, features: plan.features },
    state: status.state,
    access: status.access,
    trialDaysLeft: status.trialDaysLeft,
  };
}

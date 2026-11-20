import {
  type PlanFeatureKey,
  planFeatureProblemContextSchema,
  type PlanLimitKey,
  planLimitProblemContextSchema,
  type SubscriptionState,
  workspaceReadOnlyProblemContextSchema,
} from '@plp/contracts';
import { ApiError } from '../../lib/api-core';

/**
 * A 402 of ADR-035: the plan, not a permission, stops the request. The admin says "Nâng cấp" or
 * "Theo gói" for it, never "Không có quyền", which stays a 403.
 */
export type PlanProblem =
  | { kind: 'limit'; limit: PlanLimitKey | null; max: number | null }
  | { kind: 'feature'; feature: PlanFeatureKey | null }
  | { kind: 'read_only'; state: SubscriptionState | null };

/** The limit a 402 `plan_limit_reached` names; null for any other error. */
export function reachedLimitOf(error: unknown): PlanLimitKey | null {
  const problem = planProblemOf(error);
  return problem?.kind === 'limit' ? problem.limit : null;
}

export function planProblemOf(error: unknown): PlanProblem | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const context = error.problem.context;
  switch (error.code) {
    case 'plan_limit_reached': {
      const parsed = planLimitProblemContextSchema.safeParse(context);
      return {
        kind: 'limit',
        limit: parsed.success ? parsed.data.limit : null,
        max: parsed.success ? parsed.data.max : null,
      };
    }
    case 'plan_feature_required': {
      const parsed = planFeatureProblemContextSchema.safeParse(context);
      return { kind: 'feature', feature: parsed.success ? parsed.data.feature : null };
    }
    case 'workspace_read_only': {
      const parsed = workspaceReadOnlyProblemContextSchema.safeParse(context);
      return { kind: 'read_only', state: parsed.success ? parsed.data.state : null };
    }
    default:
      return null;
  }
}

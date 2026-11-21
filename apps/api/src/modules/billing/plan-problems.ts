import {
  type Plan,
  type PlanChangeUnavailableProblemContext,
  type PlanChangeUnavailableReason,
  type PlanFeatureKey,
  type PlanFeatureProblemContext,
  planFeatureLabels,
  type PlanLimitKey,
  type PlanLimitProblemContext,
  type SubscriptionState,
  type WorkspaceReadOnlyProblemContext,
} from '@plp/contracts';
import { AppError } from '../../shared/errors.js';

/*
 * The 402 answers of ADR-035: the admin shows "Nâng cấp" or "Theo gói" for them, never "Không có
 * quyền", which stays 403.
 */

const limitPhrases: Record<PlanLimitKey, (max: number) => string> = {
  sites: (max) => `${max} site`,
  members: (max) => `${max} thành viên, tính cả lời mời đang chờ`,
  aiUses: (max) => `${max} lượt AI mỗi tháng`,
  automationRuns: (max) => `${max} lượt automation mỗi tháng`,
  customDomains: (max) => `${max} tên miền riêng, tính trên mọi site`,
};

/** "dd/MM" of a "YYYY-MM-DD" day: "Lượt mới có vào 01/12". */
function dayMonth(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/**
 * 402 `plan_limit_reached`: creating one more would go past the plan's limit. A monthly limit
 * passes `resetsOn`, the day its uses come back, which the detail and the context name.
 */
export function planLimitReached(plan: Plan, limit: PlanLimitKey, resetsOn?: string): AppError {
  const max = plan.limits[limit];
  const allows = `Gói ${plan.name} có tối đa ${limitPhrases[limit](max)}.`;
  return new AppError(402, 'plan_limit_reached', `Đã dùng hết hạn mức của Gói ${plan.name}`, {
    detail:
      resetsOn === undefined
        ? `${allows} Nâng cấp gói để thêm.`
        : `${allows} Lượt mới có vào ${dayMonth(resetsOn)}, hoặc nâng cấp gói để có thêm ngay.`,
    context: {
      limit,
      max,
      ...(resetsOn === undefined ? {} : { resetsOn }),
    } satisfies PlanLimitProblemContext,
  });
}

/** 402 `plan_feature_required`: the plan does not include the feature. */
export function planFeatureRequired(plan: Plan, feature: PlanFeatureKey): AppError {
  return new AppError(
    402,
    'plan_feature_required',
    `Gói ${plan.name} chưa có ${planFeatureLabels[feature].toLowerCase()}`,
    {
      detail: 'Nâng cấp lên gói có tính năng này ở "Gói & thanh toán".',
      context: { feature } satisfies PlanFeatureProblemContext,
    },
  );
}

const readOnlyReasons: Partial<Record<SubscriptionState, string>> = {
  trial_expired: 'Thời gian dùng thử đã hết.',
  canceled: 'Gói đã hủy.',
  past_due: 'Gói chưa được thanh toán và đã hết thời gian ân hạn.',
  pending_payment: 'Thanh toán chưa được xác nhận và đã hết thời gian ân hạn.',
};

/** Why a workspace in `state` is read-only, as one sentence; null for a state that never is. */
export function readOnlyReasonOf(state: SubscriptionState): string | null {
  return readOnlyReasons[state] ?? null;
}

/**
 * 402 `workspace_read_only`: the workspace may only be read until its owner pays. Live pages and
 * lead forms keep working, which the detail says.
 */
export function workspaceReadOnly(state: SubscriptionState): AppError {
  const why = readOnlyReasons[state];
  const next =
    'Trang live và form vẫn chạy. Chủ sở hữu chọn gói ở "Gói & thanh toán" để sửa và xuất bản lại.';
  return new AppError(402, 'workspace_read_only', 'Workspace đang ở chế độ chỉ đọc', {
    detail: why === undefined ? next : `${why} ${next}`,
    context: { state } satisfies WorkspaceReadOnlyProblemContext,
  });
}

const unavailableDetails: Record<PlanChangeUnavailableReason, string> = {
  payment_required:
    'Thời gian dùng thử đã hết hoặc gói đã hủy. Chọn "Thanh toán ngay" để trả cho gói đã chọn và dùng tiếp.',
  unpaid: 'Kỳ này chưa được thanh toán. Thanh toán kỳ này trước, rồi đổi gói.',
};

/** 409 `plan_change_unavailable`: the choice cannot apply now, for `reason`. */
export function planChangeUnavailable(reason: PlanChangeUnavailableReason): AppError {
  return new AppError(409, 'plan_change_unavailable', 'Chưa đổi được gói lúc này', {
    detail: unavailableDetails[reason],
    context: { reason } satisfies PlanChangeUnavailableProblemContext,
  });
}

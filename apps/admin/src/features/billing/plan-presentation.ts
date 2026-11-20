import {
  type BillingCycle,
  type BillingSummary,
  billingCycleLabels,
  type Plan,
  type PlanFeatureKey,
  type PlanLimitKey,
  planFeatureLabels,
  planLimitKeys,
  planLimitLabels,
  type PlanUsage,
  type SubscriptionState,
  subscriptionStateLabels,
} from '@plp/contracts';
import type { BadgeTone, CalloutTone } from '@plp/ui';
import { formatCount, formatDate, formatDayMonth, formatVnd } from '../../lib/format';

/** "199.000 ₫ / tháng" (board 28 "[GIÁ] / [CHU KỲ]"), VAT included. */
export function priceLabel(plan: Pick<Plan, 'prices'>, cycle: BillingCycle): string {
  return `${formatVnd(plan.prices[cycle])} / ${billingCycleLabels[cycle]}`;
}

interface StateChip {
  label: string;
  tone: BadgeTone;
}

/** The status chip beside the plan's name: a trial adds "· còn N ngày". */
export function stateChip(state: SubscriptionState, trialDaysLeft: number | null): StateChip {
  const label = subscriptionStateLabels[state];
  switch (state) {
    case 'trialing':
      return {
        label: trialDaysLeft === null ? label : `${label} · còn ${trialDaysLeft} ngày`,
        tone: 'primary',
      };
    case 'active':
      return { label, tone: 'success' };
    case 'expiring_soon':
    case 'pending_payment':
      return { label, tone: 'warning' };
    case 'past_due':
    case 'trial_expired':
      return { label, tone: 'danger' };
    case 'cancel_scheduled':
    case 'canceled':
      return { label, tone: 'neutral' };
  }
}

export interface PlanBannerContent {
  /** `alert` for a state that stops work, `status` for one that only warns. */
  role: 'status' | 'alert';
  tone: CalloutTone;
  title: string;
  body: string;
}

const KEPT_RUNNING = 'Trang live và form vẫn chạy.';

/**
 * The banner of board 28 for a state, or null for an active plan. Payment actions (T2) and
 * renewal (T3) are not built, so no banner offers one.
 */
export function planBanner(
  summary: Pick<
    BillingSummary,
    'state' | 'access' | 'plan' | 'trialEndsAt' | 'periodEnd' | 'graceEndsAt'
  >,
): PlanBannerContent | null {
  const graceLine =
    summary.graceEndsAt === null
      ? ''
      : summary.access === 'full'
        ? ` ${KEPT_RUNNING} Workspace chuyển sang chỉ đọc từ ${formatDate(summary.graceEndsAt)}.`
        : ` Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING}`;
  switch (summary.state) {
    case 'active':
      return null;
    case 'trialing':
      return {
        role: 'status',
        tone: 'info',
        title: `Bạn đang dùng thử Gói ${summary.plan.name}.`,
        body:
          summary.trialEndsAt === null
            ? ''
            : `Hết hạn ${formatDate(summary.trialEndsAt)}. Bạn đổi được gói trong thời gian dùng thử.`,
      };
    case 'trial_expired':
      return {
        role: 'alert',
        tone: 'danger',
        title: 'Thời gian dùng thử đã hết.',
        body: `Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING}`,
      };
    case 'expiring_soon':
      return {
        role: 'status',
        tone: 'warning',
        title: `Gói hết hạn ngày ${formatDate(summary.periodEnd)}.`,
        body: 'Gói chưa thể tự gia hạn.',
      };
    case 'past_due':
      return {
        role: 'alert',
        tone: 'danger',
        title: 'Thanh toán kỳ này chưa thành công.',
        body: graceLine.trim(),
      };
    case 'pending_payment':
      return {
        role: 'status',
        tone: 'warning',
        title: 'Đang chờ xác nhận thanh toán.',
        body: graceLine.trim(),
      };
    case 'cancel_scheduled':
      return {
        role: 'status',
        tone: 'info',
        title: `Gói sẽ dừng vào ${formatDate(summary.periodEnd)}.`,
        body: 'Mọi thứ vẫn dùng bình thường tới hết kỳ.',
      };
    case 'canceled':
      return {
        role: 'alert',
        tone: 'danger',
        title: `Gói đã hủy từ ${formatDate(summary.periodEnd)}.`,
        body: `Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING}`,
      };
  }
}

/** "Kỳ hiện tại 01/11 – 30/11", the trial's dates, or when a stopped plan ended. */
export function periodLine(
  summary: Pick<
    BillingSummary,
    'state' | 'trialEndsAt' | 'periodStart' | 'periodEnd' | 'cancelAtPeriodEnd'
  >,
): string {
  const from = formatDate(summary.periodStart);
  const to = formatDate(summary.periodEnd);
  if (summary.state === 'trialing' || summary.state === 'trial_expired') {
    return `Dùng thử từ ${from} tới ${to}`;
  }
  if (summary.state === 'canceled') {
    return `Đã dừng từ ${to}`;
  }
  return `Kỳ hiện tại ${from} – ${to}${summary.cancelAtPeriodEnd ? ' · không gia hạn' : ''}`;
}

const MONTHLY: ReadonlySet<PlanLimitKey> = new Set(['aiUses', 'automationRuns']);

/** From this share of a limit the meter warns; at the limit it is full. */
const NEAR_LIMIT = 0.8;

export interface UsageMeter {
  key: PlanLimitKey;
  name: string;
  used: number;
  max: number;
  /** Whole percent, never above 100. */
  percent: number;
  /** `over`: past the limit, after a change to a smaller plan (nothing is removed, ADR-035). */
  tone: 'normal' | 'near' | 'full' | 'over';
  note: string;
  /** "4 / 5": the numbers the meter shows. */
  text: string;
  /** What the bar says to a screen reader. */
  label: string;
}

function meterNote(
  key: PlanLimitKey,
  tone: UsageMeter['tone'],
  max: number,
  resetsOn: string,
): string {
  if (max === 0) {
    return key === 'automationRuns' ? 'Gói này chưa có automation' : 'Gói này không có mục này';
  }
  if (MONTHLY.has(key)) {
    const spent = tone === 'over' ? 'Vượt hạn mức. ' : tone === 'full' ? 'Hết lượt. ' : '';
    return `${spent}Làm mới ${formatDayMonth(`${resetsOn}T00:00:00+07:00`)}`;
  }
  const hint =
    key === 'members'
      ? 'Lời mời đang chờ cũng được tính'
      : key === 'customDomains'
        ? 'Tính trên mọi site'
        : '';
  if (tone === 'over') {
    return 'Vượt hạn mức, không tạo thêm được';
  }
  if (tone === 'full') {
    return 'Đã dùng hết hạn mức';
  }
  return tone === 'near' ? 'Gần chạm hạn mức' : hint;
}

/** The usage cards of board 28: what the workspace uses of each limit of its plan. */
export function usageMeters(
  plan: Pick<Plan, 'limits'>,
  usage: PlanUsage,
  resetsOn: string,
): UsageMeter[] {
  return planLimitKeys.map((key) => {
    const used = usage[key];
    const max = plan.limits[key];
    const ratio = max === 0 ? 0 : used / max;
    const tone: UsageMeter['tone'] =
      max === 0
        ? 'normal'
        : ratio > 1
          ? 'over'
          : ratio === 1
            ? 'full'
            : ratio >= NEAR_LIMIT
              ? 'near'
              : 'normal';
    const name = planLimitLabels[key];
    const percent = Math.min(100, Math.round(ratio * 100));
    return {
      key,
      name,
      used,
      max,
      percent,
      tone,
      note: meterNote(key, tone, max, resetsOn),
      text: `${formatCount(used)} / ${formatCount(max)}`,
      label:
        tone === 'over'
          ? `${name}: vượt hạn mức, ${formatCount(used)} trên ${formatCount(max)}`
          : `${name}: đã dùng ${percent} phần trăm`,
    };
  });
}

export interface ComparisonRow {
  name: string;
  cells: string[];
}

const COMPARED_LIMITS: readonly PlanLimitKey[] = planLimitKeys;
const COMPARED_FEATURES: readonly PlanFeatureKey[] = ['automation', 'customRoles'];

/** "So sánh gói": one row per limit and per feature, one cell per plan in catalog order. */
export function comparisonRows(plans: readonly Plan[]): ComparisonRow[] {
  return [
    ...COMPARED_LIMITS.map((key) => ({
      name: planLimitLabels[key],
      cells: plans.map((plan) => (plan.limits[key] === 0 ? '—' : formatCount(plan.limits[key]))),
    })),
    ...COMPARED_FEATURES.map((key) => ({
      name: planFeatureLabels[key],
      cells: plans.map((plan) => (plan.features[key] ? 'Có' : '—')),
    })),
  ];
}

export interface PlanImpact {
  title: string;
  body: string;
  /** `warn` when something the workspace uses stops, `note` for what stays. */
  kind: 'warn' | 'note';
}

/**
 * What changing to `target` does to a workspace that uses `usage` now. Nothing is deleted: what
 * goes over a limit is only blocked from being created, and automations pause (ADR-035).
 */
export function planImpacts(current: Plan, target: Plan, usage: PlanUsage): PlanImpact[] {
  const impacts: PlanImpact[] = [];
  const over = (key: PlanLimitKey) => usage[key] > target.limits[key];
  if (over('sites')) {
    impacts.push({
      kind: 'warn',
      title: `${usage.sites} site, vượt hạn mức Gói ${target.name} (${target.limits.sites}).`,
      body: 'Không site nào bị gỡ; bạn không tạo thêm site mới được.',
    });
  }
  if (over('members')) {
    impacts.push({
      kind: 'warn',
      title: `${usage.members} thành viên, vượt hạn mức Gói ${target.name} (${target.limits.members}).`,
      body: 'Mọi người giữ nguyên quyền; bạn không mời thêm được.',
    });
  }
  if (over('customDomains')) {
    impacts.push({
      kind: 'warn',
      title: `${usage.customDomains} tên miền riêng, vượt hạn mức Gói ${target.name} (${target.limits.customDomains}).`,
      body: 'Tên miền đang kết nối vẫn chạy; bạn không thêm tên miền mới được.',
    });
  }
  if (current.features.automation && !target.features.automation) {
    impacts.push({
      kind: 'warn',
      title: 'Automation đang bật sẽ tạm dừng.',
      body: 'Thiết lập và lịch sử chạy được giữ lại để bật lại khi nâng gói.',
    });
  }
  if (current.features.customRoles && !target.features.customRoles) {
    impacts.push({
      kind: 'note',
      title: 'Không tạo thêm vai trò tùy chỉnh được.',
      body: 'Vai trò đã tạo vẫn giữ nguyên.',
    });
  }
  if (target.limits.aiUses < current.limits.aiUses) {
    impacts.push({
      kind: 'note',
      title: `AI còn ${formatCount(target.limits.aiUses)} lượt mỗi tháng.`,
      body: 'Bản nháp đã tạo bằng AI không bị ảnh hưởng.',
    });
  }
  return impacts;
}

/** The sentence of the read-only banner on every workspace screen. */
export function readOnlyReason(state: SubscriptionState): string {
  switch (state) {
    case 'trial_expired':
      return 'Thời gian dùng thử đã hết.';
    case 'canceled':
      return 'Gói đã hủy.';
    case 'past_due':
      return 'Gói chưa được thanh toán và đã hết thời gian ân hạn.';
    case 'pending_payment':
      return 'Thanh toán chưa được xác nhận và đã hết thời gian ân hạn.';
    default:
      return 'Gói của workspace chưa còn hiệu lực.';
  }
}

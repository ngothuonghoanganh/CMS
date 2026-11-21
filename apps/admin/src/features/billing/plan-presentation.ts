import {
  type BillingCycle,
  type BillingSummary,
  billingCycleLabels,
  type Plan,
  type PlanChangeImpacts,
  type PlanFeatureKey,
  type PlanLimitKey,
  planFeatureLabels,
  planLimitKeys,
  planLimitLabels,
  type PlanUsage,
  paymentDeclineLabels,
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

/**
 * What the banner's button does: the payments screen (a card to add or change, an invoice to pay
 * or to look at), or a dialog of this screen (keep the plan, choose a plan and pay).
 */
export type PlanBannerAction =
  | 'add_method'
  | 'update_card'
  | 'pay_invoice'
  | 'view_invoice'
  | 'keep'
  | 'choose_plan'
  | 'pay_now';

export interface PlanBannerContent {
  /** `alert` for a state that stops work, `status` for one that only warns. */
  role: 'status' | 'alert';
  tone: CalloutTone;
  title: string;
  body: string;
  action: PlanBannerAction | null;
}

export const BANNER_ACTION_LABELS: Record<PlanBannerAction, string> = {
  add_method: 'Thêm phương thức thanh toán',
  update_card: 'Cập nhật thẻ',
  pay_invoice: 'Thanh toán ngay',
  view_invoice: 'Xem hóa đơn',
  keep: 'Giữ lại gói',
  choose_plan: 'Chọn gói mới',
  pay_now: 'Chọn gói và thanh toán',
};

const KEPT_RUNNING = 'Trang live và form vẫn chạy.';
const DATA_KEPT = 'Dữ liệu được giữ nguyên.';

type BannerSummary = Pick<
  BillingSummary,
  | 'state'
  | 'access'
  | 'plan'
  | 'trialEndsAt'
  | 'periodStart'
  | 'periodEnd'
  | 'graceEndsAt'
  | 'cancelAt'
  | 'renewal'
  | 'dueInvoice'
  | 'nextRetryAt'
>;

/** "01/12", the day a stopped plan stops: board 28's "Gói sẽ dừng vào 01/12". */
function stopDay(summary: Pick<BillingSummary, 'cancelAt' | 'periodEnd'>): string {
  return formatDate(summary.cancelAt ?? summary.periodEnd);
}

/** The grace sentence of an unpaid period: until when everything works, then read-only. */
function graceSentence(summary: Pick<BillingSummary, 'access' | 'graceEndsAt'>): string {
  if (summary.graceEndsAt === null) {
    return '';
  }
  return summary.access === 'full'
    ? `${KEPT_RUNNING} Workspace chuyển sang chỉ đọc từ ${formatDate(summary.graceEndsAt)}.`
    : `Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING}`;
}

/** "Hệ thống tự thử lại ngày 03/12.", or that no automatic try is left. */
function retrySentence(summary: Pick<BillingSummary, 'nextRetryAt' | 'dueInvoice'>): string {
  if (summary.dueInvoice === null || summary.dueInvoice.status === 'pending') {
    return '';
  }
  return summary.nextRetryAt === null
    ? 'Hệ thống đã hết lượt tự thử lại.'
    : `Hệ thống tự thử lại ngày ${formatDayMonth(summary.nextRetryAt)}.`;
}

/**
 * The banner of board 28 for a state, or null for an active plan (ADR-035, T3). The action is the
 * one the state leads to; whether this viewer may take it (Chủ sở hữu only) is the screen's call.
 */
export function planBanner(summary: BannerSummary): PlanBannerContent | null {
  const due = summary.dueInvoice;
  switch (summary.state) {
    case 'active':
      return null;
    case 'trialing': {
      if (summary.cancelAt !== null) {
        return {
          role: 'status',
          tone: 'info',
          title: `Gói sẽ dừng vào ${stopDay(summary)}.`,
          body: `Bạn dùng thử bình thường tới hết ngày đó, rồi workspace chuyển sang chỉ đọc. ${DATA_KEPT} Bạn có thể giữ lại gói trước ngày đó.`,
          action: 'keep',
        };
      }
      const ends =
        summary.trialEndsAt === null ? '' : `Hết hạn ${formatDate(summary.trialEndsAt)}. `;
      const renewal = summary.renewal;
      if (renewal?.blocker === 'no_payment_method') {
        return {
          role: 'status',
          tone: 'info',
          title: `Bạn đang dùng thử Gói ${summary.plan.name}.`,
          body: `${ends}Thêm phương thức thanh toán để không gián đoạn. Nếu chưa có, workspace chuyển sang chỉ đọc khi hết dùng thử; ${DATA_KEPT.toLowerCase()}`,
          action: 'add_method',
        };
      }
      if (renewal?.blocker === 'card_expires') {
        return {
          role: 'status',
          tone: 'warning',
          title: `Bạn đang dùng thử Gói ${summary.plan.name}.`,
          body: `${ends}Thẻ đã lưu hết hạn trước ngày đó nên không tự thanh toán được. Cập nhật thẻ để không gián đoạn.`,
          action: 'update_card',
        };
      }
      return {
        role: 'status',
        tone: 'info',
        title: `Bạn đang dùng thử Gói ${summary.plan.name}.`,
        body:
          renewal === null
            ? `${ends}Bạn đổi được gói trong thời gian dùng thử.`.trim()
            : `${ends}Hết dùng thử, hệ thống tự thanh toán ${formatVnd(renewal.amount)} cho Gói ${renewal.planName} bằng thẻ đã lưu. Bạn đổi được gói trong thời gian dùng thử.`,
        action: null,
      };
    }
    case 'trial_expired':
      return {
        role: 'alert',
        tone: 'danger',
        title: 'Thời gian dùng thử đã hết.',
        body: `Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING} ${DATA_KEPT}`,
        action: 'pay_now',
      };
    case 'expiring_soon': {
      const blocker = summary.renewal?.blocker ?? null;
      return {
        role: 'status',
        tone: 'warning',
        title: `Gói hết hạn ngày ${formatDate(summary.periodEnd)}.`,
        body:
          blocker === 'card_expires'
            ? 'Thẻ đã lưu hết hạn trước ngày đó, nên không gia hạn tự động được.'
            : 'Workspace chưa có thẻ thanh toán, nên không gia hạn tự động được.',
        action: blocker === 'card_expires' ? 'update_card' : 'add_method',
      };
    }
    case 'past_due': {
      if (due === null) {
        // The trial ended with a card added too late, or a period no invoice was made for.
        return {
          role: 'alert',
          tone: 'danger',
          title: 'Kỳ này chưa được thanh toán.',
          body: [graceSentence(summary), 'Chọn gói và thanh toán để dùng tiếp.']
            .filter(Boolean)
            .join(' '),
          action: 'pay_now',
        };
      }
      const reason =
        due.lastAttempt?.code == null ? null : paymentDeclineLabels[due.lastAttempt.code];
      return {
        role: 'alert',
        tone: 'danger',
        title: `Thanh toán kỳ ${formatDayMonth(due.periodStart)} chưa thành công.`,
        body: [
          `Hóa đơn ${due.number} · ${formatVnd(due.amount)}.`,
          reason === null ? null : `${reason}.`,
          retrySentence(summary),
          graceSentence(summary),
        ]
          .filter((part) => part !== null && part !== '')
          .join(' '),
        action: 'pay_invoice',
      };
    }
    case 'pending_payment': {
      const transfer = due?.method === 'transfer' && due.status === 'pending';
      return {
        role: 'status',
        tone: 'warning',
        title: transfer ? 'Đang chờ xác nhận chuyển khoản.' : 'Đang chờ xác nhận thanh toán.',
        body: [
          due === null
            ? null
            : transfer
              ? `Hóa đơn ${due.number} · ${formatVnd(due.amount)}. Thường được xác nhận trong 1 ngày làm việc.`
              : `Hóa đơn ${due.number} · ${formatVnd(due.amount)}. Cổng thanh toán chưa trả lời.`,
          graceSentence(summary),
        ]
          .filter((part) => part !== null && part !== '')
          .join(' '),
        action: due === null ? null : 'view_invoice',
      };
    }
    case 'cancel_scheduled':
      return {
        role: 'status',
        tone: 'info',
        title: `Gói sẽ dừng vào ${stopDay(summary)}.`,
        body: 'Mọi thứ vẫn dùng bình thường tới hết kỳ. Bạn có thể giữ lại gói trước ngày đó.',
        action: 'keep',
      };
    case 'canceled':
      return {
        role: 'alert',
        tone: 'danger',
        title: `Gói đã hủy từ ${stopDay(summary)}.`,
        body: `Workspace đang ở chế độ chỉ đọc. ${KEPT_RUNNING} ${DATA_KEPT} Chọn gói mới để sửa và xuất bản lại.`,
        action: 'choose_plan',
      };
  }
}

/**
 * "Kỳ hiện tại 01/11 – 30/11 · gia hạn tự động 01/12", the trial's dates, or when a stopped plan
 * ended.
 */
export function periodLine(
  summary: Pick<
    BillingSummary,
    'state' | 'periodStart' | 'periodEnd' | 'cancelAt' | 'renewal' | 'dueInvoice'
  >,
): string {
  const from = formatDate(summary.periodStart);
  const to = formatDate(summary.periodEnd);
  const renewal = summary.renewal;
  if (summary.state === 'trialing' || summary.state === 'trial_expired') {
    const base = `Dùng thử từ ${from} tới ${to}`;
    if (summary.cancelAt !== null) {
      return `${base} · không gia hạn`;
    }
    return renewal?.autoRenews === true
      ? `${base} · tự thanh toán ${formatVnd(renewal.amount)} ngày ${formatDate(renewal.at)}`
      : base;
  }
  if (summary.state === 'canceled') {
    return `Đã dừng từ ${formatDate(summary.cancelAt ?? summary.periodEnd)}`;
  }
  const base = `Kỳ hiện tại ${from} – ${to}`;
  if (summary.cancelAt !== null) {
    return `${base} · không gia hạn`;
  }
  if (renewal === null) {
    return base;
  }
  return renewal.autoRenews
    ? `${base} · gia hạn tự động ${formatDate(renewal.at)}`
    : `${base} · chưa thể gia hạn tự động`;
}

/** Whether "Hủy gói" is offered: only a plan that runs and is paid for (the API says 409 else). */
export function canCancelPlan(summary: Pick<BillingSummary, 'state' | 'cancelAt'>): boolean {
  return (
    summary.cancelAt === null &&
    (summary.state === 'trialing' ||
      summary.state === 'active' ||
      summary.state === 'expiring_soon')
  );
}

/** "Chuyển sang Gói Cơ bản · theo tháng từ 01/12": the change waiting for the period's end. */
export function scheduledChangeLine(
  summary: Pick<BillingSummary, 'scheduledChange' | 'periodEnd'>,
  planName: string,
): string | null {
  const change = summary.scheduledChange;
  if (change === null) {
    return null;
  }
  return `Chuyển sang Gói ${planName} · theo ${billingCycleLabels[change.cycle]} từ ${formatDate(summary.periodEnd)}`;
}

/**
 * The strip across every workspace screen while an unpaid period is still inside its grace: the
 * read-only banner covers the time after. The days left need the grace's end, which only the
 * billing summary (`billing.view`) holds: without it the title says nothing of days.
 */
export function graceNotice(
  state: SubscriptionState,
  graceEndsAt: string | null,
  now: number | null,
): { title: string; detail: string } | null {
  if (state !== 'past_due' && state !== 'pending_payment') {
    return null;
  }
  const daysLeft =
    graceEndsAt === null || now === null
      ? null
      : Math.max(1, Math.ceil((new Date(graceEndsAt).getTime() - now) / 86_400_000));
  const left = daysLeft === null ? '' : ` — còn ${daysLeft} ngày trước khi chỉ đọc`;
  return state === 'past_due'
    ? {
        title: `Thanh toán lỗi${left}`,
        detail:
          'Trang live và form vẫn chạy. Thanh toán lại để workspace không bị chuyển sang chỉ đọc.',
      }
    : {
        title: `Đang chờ xác nhận thanh toán${left}`,
        detail:
          'Trang live và form vẫn chạy. Nếu thanh toán không được xác nhận kịp, workspace chuyển sang chỉ đọc.',
      };
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
  for (const key of ['sites', 'members', 'customDomains'] as const) {
    if (usage[key] > target.limits[key]) {
      impacts.push(overLimitImpact(key, usage[key], target.limits[key], target.name));
    }
  }
  if (current.features.automation && !target.features.automation) {
    impacts.push(automationImpact(null));
  }
  impacts.push(...featureImpacts(current, target));
  if (target.limits.aiUses < current.limits.aiUses) {
    impacts.push(aiImpact(target.limits.aiUses));
  }
  return impacts;
}

type OverLimitKey = 'sites' | 'members' | 'customDomains';

function overLimitImpact(
  key: OverLimitKey,
  used: number,
  max: number,
  targetName: string,
): PlanImpact {
  switch (key) {
    case 'sites':
      return {
        kind: 'warn',
        title: `${used} site, vượt hạn mức Gói ${targetName} (${max}).`,
        body: 'Không site nào bị gỡ; bạn không tạo thêm site mới được.',
      };
    case 'members':
      return {
        kind: 'warn',
        title: `${used} thành viên, vượt hạn mức Gói ${targetName} (${max}).`,
        body: 'Mọi người giữ nguyên quyền; bạn không mời thêm được.',
      };
    case 'customDomains':
      return {
        kind: 'warn',
        title: `${used} tên miền riêng, vượt hạn mức Gói ${targetName} (${max}).`,
        body: 'Tên miền đang kết nối vẫn chạy; bạn không thêm tên miền mới được.',
      };
  }
}

/** `count` is how many are enabled now; null when only the plan says so (no quote yet). */
function automationImpact(count: number | null): PlanImpact {
  return {
    kind: 'warn',
    title:
      count === null
        ? 'Automation đang bật sẽ tạm dừng.'
        : `${count} automation đang bật sẽ tạm dừng.`,
    body: 'Thiết lập và lịch sử chạy được giữ lại để bật lại khi nâng gói.',
  };
}

function aiImpact(to: number): PlanImpact {
  return {
    kind: 'note',
    title: `AI còn ${formatCount(to)} lượt mỗi tháng.`,
    body: 'Bản nháp đã tạo bằng AI không bị ảnh hưởng.',
  };
}

function featureImpacts(current: Plan, target: Plan): PlanImpact[] {
  return current.features.customRoles && !target.features.customRoles
    ? [
        {
          kind: 'note',
          title: 'Không tạo thêm vai trò tùy chỉnh được.',
          body: 'Vai trò đã tạo vẫn giữ nguyên.',
        },
      ]
    : [];
}

/**
 * What the API's quote says a change to `target` does (board 28's downgrade dialog), with the
 * counts it read from the workspace: automations to pause, members who keep their access.
 */
export function quoteImpacts(
  impacts: PlanChangeImpacts,
  current: Plan,
  target: Plan,
): PlanImpact[] {
  const list: PlanImpact[] = [];
  for (const over of impacts.overLimits) {
    if (over.limit === 'sites' || over.limit === 'members' || over.limit === 'customDomains') {
      list.push(overLimitImpact(over.limit, over.used, over.max, target.name));
    }
  }
  if (impacts.automationsToPause > 0) {
    list.push(automationImpact(impacts.automationsToPause));
  }
  list.push(...featureImpacts(current, target));
  if (impacts.aiUses.to < impacts.aiUses.from) {
    list.push(aiImpact(impacts.aiUses.to));
  }
  if (impacts.members > 0) {
    const overMembers = impacts.overLimits.some((over) => over.limit === 'members');
    list.push({
      kind: 'note',
      title: `${impacts.members} thành viên giữ nguyên quyền.`,
      body: overMembers
        ? 'Bạn không mời thêm được tới khi dưới hạn mức.'
        : 'Lời mời đang chờ cũng được tính.',
    });
  }
  return list;
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

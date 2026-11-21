import { z } from 'zod';
import { emailSchema } from './auth.js';
import { idSchema, isoDateTimeSchema } from './common.js';
import { CUSTOM_DOMAINS_MAX } from './domains.js';
import { MEMBERS_MAX } from './members.js';
import type { Permission } from './permissions.js';
import { MAX_SITES_PER_WORKSPACE } from './site.js';

/*
 * Plans, the subscription of a workspace and what it allows (ADR-035, boards 28, 16, 25). The
 * numbers live in the API's plan catalog file, so the owner changes them without changing code.
 */

export const planIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'Mã gói không hợp lệ');
export type PlanId = z.infer<typeof planIdSchema>;

export const billingCycles = ['monthly', 'yearly'] as const;
export const billingCycleSchema = z.enum(billingCycles);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

/** "[GIÁ] / tháng" on board 28. */
export const billingCycleLabels: Record<BillingCycle, string> = {
  monthly: 'tháng',
  yearly: 'năm',
};

/** An amount in đồng (VND), VAT included: whole đồng only. */
export const vndAmountSchema = z.number().int().nonnegative().max(1_000_000_000);

/** What a plan counts: monthly for AI uses and automation runs, at any moment for the rest. */
export const planLimitKeys = [
  'sites',
  'members',
  'aiUses',
  'automationRuns',
  'customDomains',
] as const;
export const planLimitKeySchema = z.enum(planLimitKeys);
export type PlanLimitKey = z.infer<typeof planLimitKeySchema>;

/** The usage cards of board 28 and the "Nâng cấp" messages. */
export const planLimitLabels: Record<PlanLimitKey, string> = {
  sites: 'Site',
  members: 'Thành viên',
  aiUses: 'Lượt AI mỗi tháng',
  automationRuns: 'Lượt automation mỗi tháng',
  customDomains: 'Tên miền riêng',
};

const limitSchema = z.number().int().nonnegative().max(1_000_000);

/** Members count pending invitations too; custom domains count those of every site. */
export const planLimitsSchema = z.strictObject({
  sites: limitSchema,
  members: limitSchema.min(1),
  aiUses: limitSchema,
  automationRuns: limitSchema,
  customDomains: limitSchema,
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planFeatureKeys = ['automation', 'customRoles'] as const;
export const planFeatureKeySchema = z.enum(planFeatureKeys);
export type PlanFeatureKey = z.infer<typeof planFeatureKeySchema>;

export const planFeatureLabels: Record<PlanFeatureKey, string> = {
  automation: 'Automation',
  customRoles: 'Vai trò tùy chỉnh',
};

export const planFeaturesSchema = z.strictObject({
  automation: z.boolean(),
  customRoles: z.boolean(),
});
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;

/** One column of "So sánh gói" (board 28). */
export const planSchema = z.strictObject({
  id: planIdSchema,
  name: z.string().trim().min(1).max(40),
  /** "Nhiều site khách hàng": who the plan is for. */
  fit: z.string().trim().max(120),
  prices: z.strictObject({ monthly: vndAmountSchema, yearly: vndAmountSchema }),
  limits: planLimitsSchema,
  features: planFeaturesSchema,
});
export type Plan = z.infer<typeof planSchema>;

/**
 * The plan catalog file (`plans.json`, ADR-035): the plans in the order board 28 compares them,
 * and the temporary numbers of the subscription's life. The API refuses to start when the file
 * does not match.
 */
export const planCatalogSchema = z
  .strictObject({
    /** A new workspace's trial: once per workspace, at no charge. */
    trial: z.strictObject({
      planId: planIdSchema,
      days: z.number().int().min(1).max(90),
    }),
    /** Days an unpaid workspace keeps full access after its payment failed. */
    graceDays: z.number().int().min(0).max(60),
    /** "Sắp hết hạn" this many days before a period ends that cannot renew by itself. */
    expiringSoonDays: z.number().int().min(1).max(60),
    /** The owner is told this many days before the trial ends ("Dùng thử sắp hết"). */
    trialReminderDays: z.number().int().min(1).max(30),
    /**
     * Days after the first failed charge of an unpaid period on which the job charges again, in
     * order; none after the last, when only the owner pays (ADR-035).
     */
    retryDays: z.array(z.number().int().min(1).max(60)).max(5),
    plans: z.array(planSchema).min(1).max(10),
  })
  .superRefine((catalog, context) => {
    const seen = new Set<string>();
    catalog.plans.forEach((plan, index) => {
      const at = (...path: (string | number)[]) => ['plans', index, ...path];
      if (seen.has(plan.id)) {
        context.addIssue({ code: 'custom', message: 'Mã gói bị trùng', path: at('id') });
      }
      seen.add(plan.id);
      // The hard limits of ADR-014, ADR-021 and ADR-022 stay above every plan.
      if (plan.limits.sites > MAX_SITES_PER_WORKSPACE) {
        context.addIssue({
          code: 'custom',
          message: `Tối đa ${MAX_SITES_PER_WORKSPACE} site mỗi workspace`,
          path: at('limits', 'sites'),
        });
      }
      if (plan.limits.members > MEMBERS_MAX) {
        context.addIssue({
          code: 'custom',
          message: `Tối đa ${MEMBERS_MAX} thành viên mỗi workspace`,
          path: at('limits', 'members'),
        });
      }
      if (plan.limits.customDomains > plan.limits.sites * CUSTOM_DOMAINS_MAX) {
        context.addIssue({
          code: 'custom',
          message: `Mỗi site có tối đa ${CUSTOM_DOMAINS_MAX} tên miền riêng`,
          path: at('limits', 'customDomains'),
        });
      }
      if (!plan.features.automation && plan.limits.automationRuns > 0) {
        context.addIssue({
          code: 'custom',
          message: 'Gói không có automation thì không có lượt automation',
          path: at('limits', 'automationRuns'),
        });
      }
    });
    if (!seen.has(catalog.trial.planId)) {
      context.addIssue({
        code: 'custom',
        message: 'Gói dùng thử không có trong danh sách gói',
        path: ['trial', 'planId'],
      });
    }
    if (catalog.trialReminderDays >= catalog.trial.days) {
      context.addIssue({
        code: 'custom',
        message: 'Nhắc trước khi hết dùng thử phải ít ngày hơn thời gian dùng thử',
        path: ['trialReminderDays'],
      });
    }
    catalog.retryDays.forEach((day, index) => {
      const before = catalog.retryDays[index - 1];
      if (before !== undefined && day <= before) {
        context.addIssue({
          code: 'custom',
          message: 'Các ngày thử lại phải tăng dần',
          path: ['retryDays', index],
        });
      }
      // A retry after the grace would charge a workspace already read-only, by itself (ADR-035).
      if (day >= catalog.graceDays) {
        context.addIssue({
          code: 'custom',
          message: 'Ngày thử lại phải nằm trong thời gian ân hạn',
          path: ['retryDays', index],
        });
      }
    });
  });
export type PlanCatalog = z.infer<typeof planCatalogSchema>;

export function findPlan(catalog: Pick<PlanCatalog, 'plans'>, id: string): Plan | undefined {
  return catalog.plans.find((plan) => plan.id === id);
}

/** Rows of board 16 marked "Theo gói": they need a plan with the feature, not a permission. */
const permissionPlanFeatures: Partial<Record<Permission, PlanFeatureKey>> = {
  'automations.view': 'automation',
  'automations.manage': 'automation',
};

export function planFeatureOf(permission: Permission): PlanFeatureKey | null {
  return permissionPlanFeatures[permission] ?? null;
}

/*
 * The subscription (ADR-035): facts are stored, never the state, which follows from them and the
 * time (§2 rule 12).
 */

export const subscriptionStates = [
  'trialing',
  'trial_expired',
  'active',
  'expiring_soon',
  'past_due',
  'pending_payment',
  'cancel_scheduled',
  'canceled',
] as const;
export const subscriptionStateSchema = z.enum(subscriptionStates);
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

/** The status chip of board 28; a trial adds "· còn N ngày". */
export const subscriptionStateLabels: Record<SubscriptionState, string> = {
  trialing: 'Dùng thử',
  trial_expired: 'Hết dùng thử',
  active: 'Đang hoạt động',
  expiring_soon: 'Sắp hết hạn',
  past_due: 'Quá hạn',
  pending_payment: 'Chờ thanh toán',
  cancel_scheduled: 'Đã lên lịch hủy',
  canceled: 'Đã hủy',
};

/** `read_only`: the admin may read, live pages and lead forms keep working (ADR-035). */
export const accessLevels = ['full', 'read_only'] as const;
export const accessLevelSchema = z.enum(accessLevels);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

/** A saved card: the gateway holds the card, the system its token and what the owner sees. */
export const paymentMethodSchema = z.strictObject({
  token: z.string().min(1).max(200),
  brand: z.string().min(1).max(40),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * 10 digits, or 13 as `0123456789-001`; spaces are dropped, and 13 digits typed without the dash
 * get it, so one code is always stored the same way.
 */
export const taxCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, '').replace(/^(\d{10})(\d{3})$/, '$1-$2'))
  .pipe(
    z.string().regex(/^\d{10}(-\d{3})?$/, 'Mã số thuế gồm 10 chữ số, hoặc 13 dạng 0123456789-001'),
  );

/** "Thông tin xuất hóa đơn", copied onto each invoice when it is made. */
export const billingInfoSchema = z.strictObject({
  companyName: z.string().trim().min(1, 'Nhập tên đơn vị').max(200),
  taxCode: taxCodeSchema,
  address: z.string().trim().min(1, 'Nhập địa chỉ').max(300),
  email: emailSchema,
});
export type BillingInfo = z.infer<typeof billingInfoSchema>;

/** A downgrade or a change of cycle, applied when the period ends. */
export const scheduledChangeSchema = z.strictObject({
  planId: planIdSchema,
  cycle: billingCycleSchema,
});
export type ScheduledChange = z.infer<typeof scheduledChangeSchema>;

/** What the master's `subscriptions` stores for a workspace (ADR-035). */
export const subscriptionFactsSchema = z.strictObject({
  planId: planIdSchema,
  cycle: billingCycleSchema,
  /** Null once a paid period follows the trial. */
  trialEndsAt: z.date().nullable(),
  /** The paid period, or the trial while there is one. */
  periodStart: z.date(),
  periodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
  scheduledChange: scheduledChangeSchema.nullable(),
  /** An invoice waiting for its payment (a charge, or a transfer to confirm). */
  openInvoiceId: idSchema.nullable(),
  /** The first failed charge of the period not paid yet; the grace counts from it. */
  failedSince: z.date().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  /**
   * The trial ended with no card, and the saved one came only after (T3): the end of the trial
   * does not charge it, and the trial stays expired until "Thanh toán ngay" pays.
   */
  cardAfterTrial: z.boolean(),
  billingInfo: billingInfoSchema.nullable(),
  /** The next job of the subscription: the end of the trial or the period, or a retry. */
  nextActionAt: z.date().nullable(),
  /** Held by the instance working on it until then. */
  lockedUntil: z.date().nullable(),
  /** Goes up with every change; writes are guarded by it. */
  version: z.number().int().nonnegative(),
});
export type SubscriptionFacts = z.infer<typeof subscriptionFactsSchema>;

/** The policy numbers of the catalog that the state follows. */
export type SubscriptionPolicy = Pick<PlanCatalog, 'graceDays' | 'expiringSoonDays'>;

export interface SubscriptionStatus {
  state: SubscriptionState;
  access: AccessLevel;
  /** Whole days left in the trial, rounded up ("còn 14 ngày"); null outside a trial. */
  trialDaysLeft: number | null;
  /** When an unpaid workspace turns read-only; null when nothing is overdue. */
  graceEndsAt: Date | null;
  /**
   * Whole days left before an unpaid workspace turns read-only, rounded up ("còn 7 ngày"); null
   * when nothing is overdue or it is read-only already.
   */
  graceDaysLeft: number | null;
}

const DAY_MS = 86_400_000;

/** Whether the card is still valid at `at`: a card works through the last day of its month. */
export function cardValidAt(
  method: Pick<PaymentMethod, 'expMonth' | 'expYear'>,
  at: Date,
): boolean {
  // `expMonth` counts from 1, so it is the index of the month after the card expires.
  return at.getTime() < Date.UTC(method.expYear, method.expMonth, 1);
}

/**
 * Whether the end of the trial charges the saved card (ADR-035, T3): only a card saved while the
 * trial ran. One saved after a trial that ended without a card is not charged for it.
 */
export function trialEndCharges(
  facts: Pick<SubscriptionFacts, 'cardAfterTrial'> & { paymentMethod: object | null },
): boolean {
  return facts.paymentMethod !== null && !facts.cardAfterTrial;
}

/**
 * The state and access level of a subscription at `now` (ADR-035, §2 rule 12). Nothing stores
 * them: they change as time passes, so a job that runs late never leaves a stale state.
 *
 * - A trial is `trialing` until `trialEndsAt`. After it, a trial with a payment method is being
 *   charged: unpaid with the grace (`past_due`) until the charge job records the outcome, never
 *   read-only at once because the job runs after the trial's end. Without a payment method or a
 *   payment under way, the workspace is `trial_expired` and read-only; a card saved after that
 *   changes nothing (`trialEndCharges`), only paying does (T3).
 * - A paid period that ends with `cancelAtPeriodEnd` is `canceled` and read-only.
 * - A period (or trial) that ended unpaid, or a failed charge, is `past_due`; an invoice waiting
 *   without a failure (a transfer to confirm) is `pending_payment`. Either keeps full access for
 *   `graceDays` from `failedSince`, or from the end of the period when no charge has failed yet,
 *   so a renewal job that never ran still ends in read-only.
 */
export function subscriptionStatusOf(
  facts: Pick<
    SubscriptionFacts,
    | 'trialEndsAt'
    | 'periodEnd'
    | 'cancelAtPeriodEnd'
    | 'openInvoiceId'
    | 'failedSince'
    | 'cardAfterTrial'
  > & { paymentMethod: Pick<PaymentMethod, 'expMonth' | 'expYear'> | null },
  policy: SubscriptionPolicy,
  now: Date,
): SubscriptionStatus {
  const at = now.getTime();
  const status = (state: SubscriptionState, access: AccessLevel): SubscriptionStatus => ({
    state,
    access,
    trialDaysLeft: null,
    graceEndsAt: null,
    graceDaysLeft: null,
  });
  const unpaid = (endedAt: Date): SubscriptionStatus => {
    const since = facts.failedSince ?? endedAt;
    const graceEndsAt = new Date(since.getTime() + policy.graceDays * DAY_MS);
    const inGrace = at < graceEndsAt.getTime();
    return {
      state:
        facts.failedSince === null && facts.openInvoiceId !== null ? 'pending_payment' : 'past_due',
      access: inGrace ? 'full' : 'read_only',
      trialDaysLeft: null,
      graceEndsAt,
      graceDaysLeft: inGrace ? Math.ceil((graceEndsAt.getTime() - at) / DAY_MS) : null,
    };
  };
  const paymentUnderWay = facts.failedSince !== null || facts.openInvoiceId !== null;
  // A card saved during the trial is charged at its end (ADR-035), by a job that runs after it.
  const charged = paymentUnderWay || trialEndCharges(facts);

  if (facts.trialEndsAt !== null) {
    const trialEnd = facts.trialEndsAt.getTime();
    if (at < trialEnd) {
      return {
        ...status('trialing', 'full'),
        trialDaysLeft: Math.ceil((trialEnd - at) / DAY_MS),
      };
    }
    if (facts.cancelAtPeriodEnd) {
      return status('canceled', 'read_only');
    }
    return charged ? unpaid(facts.trialEndsAt) : status('trial_expired', 'read_only');
  }
  if (at >= facts.periodEnd.getTime()) {
    return facts.cancelAtPeriodEnd ? status('canceled', 'read_only') : unpaid(facts.periodEnd);
  }
  if (paymentUnderWay) {
    return unpaid(facts.periodEnd);
  }
  if (facts.cancelAtPeriodEnd) {
    return status('cancel_scheduled', 'full');
  }
  const renews = facts.paymentMethod !== null && cardValidAt(facts.paymentMethod, facts.periodEnd);
  if (!renews && facts.periodEnd.getTime() - at <= policy.expiringSoonDays * DAY_MS) {
    return status('expiring_soon', 'full');
  }
  return status('active', 'full');
}

/*
 * Endpoints (ADR-035).
 */

/** `GET /billing/plans`: the plans any signed-in member may compare. */
export const planCatalogResponseSchema = z.object({
  plans: z.array(planSchema),
  trial: z.object({ planId: planIdSchema, days: z.number().int().positive() }),
});
export type PlanCatalogResponse = z.infer<typeof planCatalogResponseSchema>;

/**
 * What the workspace uses now, for each limit of its plan. Members count pending invitations;
 * AI uses and automation runs count the current month in Vietnam.
 */
export const planUsageSchema = z.strictObject({
  sites: z.number().int().nonnegative(),
  members: z.number().int().nonnegative(),
  aiUses: z.number().int().nonnegative(),
  automationRuns: z.number().int().nonnegative(),
  customDomains: z.number().int().nonnegative(),
});
export type PlanUsage = z.infer<typeof planUsageSchema>;

/**
 * The workspace's plan for every member (`pages.view`): "Workspace · Gói {tên}" in Sidebar v2,
 * the "Nâng cấp" chips of features it lacks and the read-only banner.
 */
export const workspacePlanSchema = z.object({
  plan: planSchema.pick({ id: true, name: true, limits: true, features: true }),
  state: subscriptionStateSchema,
  access: accessLevelSchema,
  trialDaysLeft: z.number().int().nonnegative().nullable(),
  /** Days left before an unpaid workspace turns read-only, by the server's clock (T3). */
  graceDaysLeft: z.number().int().nonnegative().nullable(),
  /**
   * A payment of the unpaid period waits for its answer (T3): a bank transfer to confirm, or a
   * gateway that has not replied. The banners say it is waiting, not that it failed.
   */
  paymentWaiting: z.boolean(),
});
export type WorkspacePlan = z.infer<typeof workspacePlanSchema>;

/**
 * "Đổi gói" (`billing.manage`). During the trial a change is free; `payNow` pays for the chosen
 * plan at once instead, which ends the trial (ADR-035, T2), or starts a canceled plan again (T3).
 * A change that charges (paying now, or an upgrade of a paid period) names the amount of the quote
 * the owner confirmed. A lower price or another cycle in a paid period is scheduled for its end.
 */
export const changePlanRequestSchema = z.strictObject({
  planId: planIdSchema,
  cycle: billingCycleSchema,
  payNow: z.boolean().default(false),
  expectedAmount: vndAmountSchema.optional(),
  /**
   * How a payment now is made (T3): the saved card (unset), or a bank transfer, which leaves the
   * invoice waiting for the gateway's confirmation and changes the plan when it arrives.
   */
  payWith: z.enum(['card', 'transfer']).optional(),
});
export type ChangePlanRequest = z.infer<typeof changePlanRequestSchema>;

/**
 * `context` of a 402 `plan_limit_reached`: which limit, and the plan's number. A monthly limit
 * (AI uses) adds the day its uses come back, the 1st of the next month in Vietnam.
 */
export const planLimitProblemContextSchema = z.object({
  limit: planLimitKeySchema,
  max: z.number().int().nonnegative(),
  resetsOn: z.iso.date().optional(),
});
export type PlanLimitProblemContext = z.infer<typeof planLimitProblemContextSchema>;

/** `context` of a 402 `plan_feature_required`. */
export const planFeatureProblemContextSchema = z.object({ feature: planFeatureKeySchema });
export type PlanFeatureProblemContext = z.infer<typeof planFeatureProblemContextSchema>;

/** `context` of a 402 `workspace_read_only`: why, for the banner that leads to board 28. */
export const workspaceReadOnlyProblemContextSchema = z.object({ state: subscriptionStateSchema });
export type WorkspaceReadOnlyProblemContext = z.infer<typeof workspaceReadOnlyProblemContextSchema>;

/**
 * The API's movable clock for lifecycle tests (`BILLING_TEST_CLOCK=on`, never in production):
 * every billing decision of that API process reads it.
 */
export const testClockSchema = z.object({
  now: isoDateTimeSchema,
  /** How far it is ahead of real time (negative: behind). */
  offsetMs: z.number().int(),
});
export type TestClock = z.infer<typeof testClockSchema>;

/** Moves the clock to `now`; null goes back to real time. */
export const setTestClockRequestSchema = z.strictObject({ now: isoDateTimeSchema.nullable() });
export type SetTestClockRequest = z.infer<typeof setTestClockRequestSchema>;

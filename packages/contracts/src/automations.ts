import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { contactPersonSchema, contactTagSchema } from './contacts.js';
import { leadStatusSchema } from './lead-inbox.js';

/**
 * Automations of a site (boards 25–27, ADR-034): when an event happens, if every condition holds,
 * the actions run one after the other through the queue in MongoDB. `automations.view` reads
 * them, `automations.manage` creates, changes, enables and pauses them.
 */

export const AUTOMATIONS_PER_SITE_MAX = 20;
export const AUTOMATION_CONDITIONS_MAX = 5;
export const AUTOMATION_ACTIONS_MAX = 5;
/** Runs a workspace may start each Vietnamese calendar month (ADR-034); Phase 4 ties it to plans. */
export const AUTOMATION_RUNS_PER_MONTH = 2000;
/** Failed runs in a row after which an automation pauses itself. */
export const AUTOMATION_FAILURES_BEFORE_PAUSE = 20;
export const AUTOMATION_NAME_MAX = 80;
export const AUTOMATION_ROTATION_MAX = 10;
export const AUTOMATION_EMAIL_RECIPIENTS_MAX = 5;
export const AUTOMATION_EMAIL_SUBJECT_MAX = 150;
/** A task's due time, up to 30 days after the event. */
export const AUTOMATION_TASK_DUE_MAX_MINUTES = 43_200;
export const AUTOMATION_PAGES_MAX = 20;

export const automationStates = ['draft', 'on', 'paused'] as const;
export const automationStateSchema = z.enum(automationStates);
export type AutomationState = z.infer<typeof automationStateSchema>;

export const automationPausedReasons = ['user', 'errors'] as const;
export const automationPausedReasonSchema = z.enum(automationPausedReasons);
export type AutomationPausedReason = z.infer<typeof automationPausedReasonSchema>;

/** "Lead còn “Mới” sau …" */
export const leadStillNewMinutes = [5, 15, 30, 60, 240, 1440] as const;

export const automationTriggerSchema = z.discriminatedUnion('kind', [
  /** A lead not suspected of spam; on some pages only, or on any when the list is empty. */
  z.strictObject({
    kind: z.literal('lead_created'),
    pageIds: z.array(idSchema).max(AUTOMATION_PAGES_MAX),
  }),
  z.strictObject({
    kind: z.literal('lead_still_new'),
    minutes: z.literal(leadStillNewMinutes),
  }),
  /** Into one stage, or into any when `stage` is null. */
  z.strictObject({
    kind: z.literal('opportunity_stage_changed'),
    stage: leadStatusSchema.nullable(),
  }),
  z.strictObject({ kind: z.literal('task_overdue') }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationTriggerKind = AutomationTrigger['kind'];

export const sourceFields = ['source', 'medium', 'campaign'] as const;

export const automationConditionSchema = z.discriminatedUnion('kind', [
  /** "utm_source chứa facebook", without regard to case and accents. */
  z.strictObject({
    kind: z.literal('source_contains'),
    field: z.enum(sourceFields),
    text: z.string().trim().max(60),
  }),
  z.strictObject({
    kind: z.literal('page_in'),
    pageIds: z.array(idSchema).max(AUTOMATION_PAGES_MAX),
  }),
  z.strictObject({ kind: z.literal('contact_has_tag'), tag: contactTagSchema.or(z.literal('')) }),
  z.strictObject({
    kind: z.literal('opportunity_value_at_least'),
    value: z.number().int().nonnegative().max(10_000_000_000),
  }),
  z.strictObject({ kind: z.literal('stage_is'), stages: z.array(leadStatusSchema).max(6) }),
]);
export type AutomationCondition = z.infer<typeof automationConditionSchema>;

/** Who a task or an email goes to: the profile's owner, or named members. */
export const automationActionSchema = z.discriminatedUnion('kind', [
  /** One member, or a rotation between up to 10. */
  z.strictObject({
    kind: z.literal('assign'),
    memberIds: z.array(idSchema).max(AUTOMATION_ROTATION_MAX),
  }),
  z.strictObject({
    kind: z.literal('create_task'),
    title: z.string().trim().max(120),
    dueInMinutes: z.number().int().min(0).max(AUTOMATION_TASK_DUE_MAX_MINUTES),
    assignee: z.union([z.literal('owner'), idSchema]),
  }),
  z.strictObject({ kind: z.literal('add_tag'), tag: contactTagSchema.or(z.literal('')) }),
  /**
   * An internal email. The subject may hold «Tên khách», «Trang nguồn», «Người phụ trách» and
   * «Link hồ sơ»; the mail never holds the person's phone number or email.
   */
  z.strictObject({
    kind: z.literal('email'),
    to: z.union([z.literal('owner'), z.array(idSchema).max(AUTOMATION_EMAIL_RECIPIENTS_MAX)]),
    subject: z.string().trim().max(AUTOMATION_EMAIL_SUBJECT_MAX),
  }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationActionKind = AutomationAction['kind'];

/** The placeholders an email subject may hold, as the editor shows them. */
export const automationPlaceholders = [
  '«Tên khách»',
  '«Trang nguồn»',
  '«Người phụ trách»',
  '«Link hồ sơ»',
] as const;

export const automationDefinitionSchema = z.object({
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).max(AUTOMATION_CONDITIONS_MAX),
  actions: z.array(automationActionSchema).max(AUTOMATION_ACTIONS_MAX),
});
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;

/** "Bắt đầu từ mẫu" of board 25; the webhook recipe comes with webhooks (A3). */
export const automationRecipes = ['assign_new_leads', 'remind_uncalled', 'notify_won'] as const;
export const automationRecipeSchema = z.enum(automationRecipes);
export type AutomationRecipe = z.infer<typeof automationRecipeSchema>;

export const automationRecipeLabels: Record<
  AutomationRecipe,
  { name: string; description: string }
> = {
  assign_new_leads: {
    name: 'Giao lead mới cho người trực',
    description: 'Xoay vòng giữa các nhân viên, tạo việc “Gọi lại trong 15 phút”.',
  },
  remind_uncalled: {
    name: 'Nhắc khi lead chưa được gọi',
    description: 'Sau 15 phút còn “Mới” thì báo người phụ trách và quản lý.',
  },
  notify_won: {
    name: 'Báo tin khi chốt được khách',
    description: 'Email nội bộ cho quản lý khi cơ hội chuyển sang Thắng.',
  },
};

export const automationRunStatuses = [
  'scheduled',
  'queued',
  'running',
  'waiting_retry',
  'succeeded',
  'failed',
  'skipped',
  'stopped',
] as const;
export const automationRunStatusSchema = z.enum(automationRunStatuses);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationListItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  state: automationStateSchema,
  pausedReason: automationPausedReasonSchema.nullable(),
  trigger: automationTriggerSchema,
  /** Steps the automation cannot run without: it stays a draft until none is left. */
  missing: z.number().int().nonnegative(),
  createdBy: contactPersonSchema.nullable(),
  createdAt: isoDateTimeSchema,
  lastRun: z.object({ status: automationRunStatusSchema, at: isoDateTimeSchema }).nullable(),
  /** Runs started in the last 30 days, and how many of them failed. */
  last30Days: z.object({
    runs: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  /** Events passed over this month because the workspace had no run left. */
  skippedForQuota: z.number().int().nonnegative(),
});
export type AutomationListItem = z.infer<typeof automationListItemSchema>;

export const automationUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  /** "2026-12-01": when the runs come back after they ran out. */
  resetsOn: z.iso.date(),
});
export type AutomationUsage = z.infer<typeof automationUsageSchema>;

export const automationListResponseSchema = z.object({
  items: z.array(automationListItemSchema),
  usage: automationUsageSchema,
});
export type AutomationListResponse = z.infer<typeof automationListResponseSchema>;

export const createAutomationRequestSchema = z.strictObject({ recipe: automationRecipeSchema });
export type CreateAutomationRequest = z.infer<typeof createAutomationRequestSchema>;

/** "Bật" or "Tạm dừng" from the list. */
export const setAutomationStateRequestSchema = z.strictObject({
  state: z.enum(['on', 'paused']),
});
export type SetAutomationStateRequest = z.infer<typeof setAutomationStateRequestSchema>;

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

/**
 * The URL a webhook step calls (ADR-034): HTTPS on port 443, at most 500 characters. Addresses
 * inside private networks are refused when the step runs, after the name is resolved.
 */
export const WEBHOOK_URL_MAX = 500;
export const webhookUrlSchema = z
  .string()
  .trim()
  .max(WEBHOOK_URL_MAX, `Địa chỉ tối đa ${WEBHOOK_URL_MAX} ký tự`)
  .refine((value) => {
    if (value === '') {
      return true;
    }
    if (!URL.canParse(value)) {
      return false;
    }
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.port === '' || url.port === '443') &&
      url.username === '' &&
      url.password === ''
    );
  }, 'Nhập địa chỉ https:// trên cổng 443');

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
  /**
   * "Gọi webhook": POST of the lead to another system, signed with the step's secret. `secretId`
   * names the secret the API keeps encrypted; empty until the step is first saved.
   */
  z.strictObject({
    kind: z.literal('webhook'),
    url: webhookUrlSchema,
    secretId: z.string().max(40),
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

/** "Bắt đầu từ mẫu" of board 25. */
export const automationRecipes = [
  'assign_new_leads',
  'remind_uncalled',
  'notify_won',
  'send_webhook',
] as const;
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
  send_webhook: {
    name: 'Gửi lead sang hệ thống khác',
    description: 'Gọi webhook với dữ liệu lead, thử lại khi lỗi.',
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

/** From a recipe, or a blank draft ("Tạo automation") without one. */
export const createAutomationRequestSchema = z.strictObject({
  recipe: automationRecipeSchema.optional(),
});
export type CreateAutomationRequest = z.infer<typeof createAutomationRequestSchema>;

/**
 * "Bật" or "Tạm dừng". `includeRecent` is "Chạy luôn cho … lead trong 24 giờ qua chưa có người
 * phụ trách", for an automation started by new leads only.
 */
export const setAutomationStateRequestSchema = z.strictObject({
  state: z.enum(['on', 'paused']),
  includeRecent: z.boolean().optional(),
});
export type SetAutomationStateRequest = z.infer<typeof setAutomationStateRequestSchema>;

/** Leads a run on enabling may pick up again: those of the last 24 hours without an owner. */
export const AUTOMATION_RECENT_HOURS = 24;
export const AUTOMATION_RECENT_MAX = 200;

export const automationOptionsSchema = z.object({
  /** Members who may be given profiles, tasks and emails: `leads.view` on the site. */
  members: z.array(contactPersonSchema),
  pages: z.array(z.object({ id: idSchema, title: z.string() })),
  tags: z.array(z.string()),
});
export type AutomationOptions = z.infer<typeof automationOptionsSchema>;

/** Board 26: the automation with its definition, and the choices its steps offer. */
export const automationDetailSchema = automationListItemSchema.extend({
  version: z.number().int().positive(),
  definition: automationDefinitionSchema,
  updatedAt: isoDateTimeSchema,
  options: automationOptionsSchema,
  /**
   * Secrets created by this save, shown this once: the receiving system checks
   * `X-PLP-Signature` with them. Never returned again.
   */
  revealedSecrets: z.array(z.object({ secretId: z.string(), secret: z.string() })),
});
export type AutomationDetail = z.infer<typeof automationDetailSchema>;

/** The autosave of board 26: the name, the steps, or both. */
export const updateAutomationRequestSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1, 'Nhập tên automation')
      .max(AUTOMATION_NAME_MAX, `Tên tối đa ${AUTOMATION_NAME_MAX} ký tự`),
    definition: automationDefinitionSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Không có thay đổi nào để lưu');
export type UpdateAutomationRequest = z.input<typeof updateAutomationRequestSchema>;

/** "Chạy thử" (ADR-034): with the latest lead of the site, or a sample without real data. */
export const testAutomationRequestSchema = z.strictObject({
  definition: automationDefinitionSchema,
  source: z.enum(['latest', 'sample']),
});
export type TestAutomationRequest = z.infer<typeof testAutomationRequestSchema>;

/**
 * What a step would do: `pass` it holds or would run, `fail` a condition that stops the run,
 * `skip` an action that would fail, `not_reached` after a condition failed.
 */
export const testStepResultSchema = z.object({
  outcome: z.enum(['pass', 'fail', 'skip', 'not_reached']),
  text: z.string(),
});
export type TestStepResult = z.infer<typeof testStepResultSchema>;

export const testAutomationResponseSchema = z.object({
  /** The lead the test used; null for the sample. */
  lead: z.object({ name: z.string(), at: isoDateTimeSchema }).nullable(),
  trigger: testStepResultSchema,
  conditions: z.array(testStepResultSchema),
  actions: z.array(testStepResultSchema),
});
export type TestAutomationResponse = z.infer<typeof testAutomationResponseSchema>;

/** What the "Bật" dialog says: the site's leads, and the recent ones without an owner. */
export const automationActivationSchema = z.object({
  leads: z.number().int().nonnegative(),
  recentUnassigned: z.number().int().nonnegative(),
  /** Whether "Chạy luôn cho …" applies: an automation started by new leads. */
  canIncludeRecent: z.boolean(),
});
export type AutomationActivation = z.infer<typeof automationActivationSchema>;

/** "Đổi bí mật": the step's new secret, shown once; the old one stops signing at once. */
export const rotateWebhookSecretRequestSchema = z.strictObject({
  secretId: z.string().min(1).max(40),
});
export type RotateWebhookSecretRequest = z.infer<typeof rotateWebhookSecretRequestSchema>;
export const revealedSecretSchema = z.object({ secretId: z.string(), secret: z.string() });
export type RevealedSecret = z.infer<typeof revealedSecretSchema>;

/** Board 27's filters. `waiting` is a run that waits for a retry. */
export const automationRunFilters = ['all', 'failed', 'waiting', 'succeeded'] as const;
export const automationRunFilterSchema = z.enum(automationRunFilters);
export type AutomationRunFilter = z.infer<typeof automationRunFilterSchema>;

export const AUTOMATION_RUNS_PAGE_SIZE = 30;
/** "Thử lại N lượt lỗi" takes at most this many. */
export const AUTOMATION_RETRY_MAX = 100;

export const automationRunListQuerySchema = z.strictObject({
  status: automationRunFilterSchema.default('all'),
  cursor: z.string().min(1).max(200).optional(),
});
export type AutomationRunListQuery = z.input<typeof automationRunListQuerySchema>;

export const automationTriggerKindSchema = z.enum([
  'lead_created',
  'lead_still_new',
  'opportunity_stage_changed',
  'task_overdue',
]);

export const automationRunItemSchema = z.object({
  id: idSchema,
  status: automationRunStatusSchema,
  trigger: automationTriggerKindSchema,
  /** The profile's name now; null once it was deleted (runs keep no personal data). */
  contactName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type AutomationRunItem = z.infer<typeof automationRunItemSchema>;

export const automationRunListResponseSchema = z.object({
  items: z.array(automationRunItemSchema),
  nextCursor: z.string().nullable(),
  /** Failed runs of the last 30 days: "Thất bại · 3". */
  failed: z.number().int().nonnegative(),
  /** Failed runs of the last 24 hours, for the banner. */
  failedLastDay: z.number().int().nonnegative(),
  last30Days: z.object({
    runs: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
export type AutomationRunListResponse = z.infer<typeof automationRunListResponseSchema>;

/** One step of a run as board 27 shows it. */
export const automationRunStepSchema = z.object({
  action: automationActionSchema,
  status: z.enum(['pending', 'succeeded', 'failed']),
  attempts: z.number().int().nonnegative(),
  at: isoDateTimeSchema.nullable(),
  error: z.object({ code: z.string(), httpStatus: z.number().int().nullable() }).nullable(),
  summary: z.string().nullable(),
});
export type AutomationRunStep = z.infer<typeof automationRunStepSchema>;

export const automationRunDetailSchema = automationRunItemSchema.extend({
  /** The key that keeps an event from running the automation twice. */
  eventKey: z.string(),
  version: z.number().int().positive(),
  definition: automationDefinitionSchema,
  reason: z.string().nullable(),
  steps: z.array(automationRunStepSchema),
  nextAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
});
export type AutomationRunDetail = z.infer<typeof automationRunDetailSchema>;

/** "Thử lại N lượt lỗi": how many runs went back to the queue. */
export const retryRunsResponseSchema = z.object({ retried: z.number().int().nonnegative() });
export type RetryRunsResponse = z.infer<typeof retryRunsResponseSchema>;

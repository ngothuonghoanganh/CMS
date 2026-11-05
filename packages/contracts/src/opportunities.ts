import { z } from 'zod';
import { vnDaySchema } from './calendar.js';
import { idSchema, isoDateTimeSchema } from './common.js';
import { CONTACT_BULK_MAX, contactPersonSchema } from './contacts.js';
import { type LeadStatus, leadStatusLabels, leadStatuses } from './lead-inbox.js';

/**
 * Opportunities and the fixed pipeline (board 24, ADR-033). A lead's status is the stage of its
 * opportunity, so the stages are the lead statuses. `leads.view` reads the pipeline,
 * `leads.handle` changes it.
 */

export const opportunityStages = leadStatuses;
export const opportunityStageSchema = z.enum(opportunityStages);
export type OpportunityStage = LeadStatus;
export const opportunityStageLabels = leadStatusLabels;

/** Mới → Đã đến: an opportunity still being worked on. */
export const openOpportunityStages = ['new', 'contacted', 'scheduled', 'visited'] as const;
export const openOpportunityStageSchema = z.enum(openOpportunityStages);
export type OpenOpportunityStage = z.infer<typeof openOpportunityStageSchema>;

export function isOpenStage(stage: OpportunityStage): stage is OpenOpportunityStage {
  return stage !== 'won' && stage !== 'lost';
}

/** "Mở lại" takes a won or lost opportunity back here. */
export const REOPEN_STAGE: OpenOpportunityStage = 'visited';

export const lostReasons = [
  'price_higher',
  'chose_elsewhere',
  'unreachable',
  'no_need',
  'other',
] as const;
export const lostReasonSchema = z.enum(lostReasons);
export type LostReason = z.infer<typeof lostReasonSchema>;

export const lostReasonLabels: Record<LostReason, string> = {
  price_higher: 'Giá cao hơn dự tính',
  chose_elsewhere: 'Chọn nơi khác',
  unreachable: 'Không liên lạc được',
  no_need: 'Chưa có nhu cầu',
  other: 'Khác',
};

/** Whole đồng, at most 10 tỷ. */
export const OPPORTUNITY_VALUE_MAX = 10_000_000_000;
export const OPPORTUNITY_TITLE_MAX = 120;
export const LOST_NOTE_MAX = 200;
/** Cards a column of the board shows at most; its count and total cover every card. */
export const PIPELINE_COLUMN_MAX = 50;
/** Opportunities a profile lists, open ones first. */
export const CONTACT_OPPORTUNITIES_SHOWN = 10;

export const opportunityValueSchema = z
  .number({ error: 'Nhập số tiền' })
  .int('Nhập số tiền tròn đồng')
  .min(0, 'Số tiền không âm')
  .max(OPPORTUNITY_VALUE_MAX, 'Tối đa 10 tỷ đồng');

export const opportunityTitleSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên cơ hội')
  .max(OPPORTUNITY_TITLE_MAX, `Tên cơ hội tối đa ${OPPORTUNITY_TITLE_MAX} ký tự`);

/** The open task due first: "Việc tiếp theo" of a card. Overdue is derived from `dueAt`. */
export const opportunityNextTaskSchema = z.object({
  title: z.string(),
  dueAt: isoDateTimeSchema,
});

export const opportunitySchema = z.object({
  id: idSchema,
  title: z.string(),
  stage: opportunityStageSchema,
  /** Expected value; null when nobody entered one. */
  value: z.number().int().nonnegative().nullable(),
  /** Who entered the expected value ("do Thu Hà nhập"). */
  valueBy: contactPersonSchema.nullable(),
  won: z.object({ value: z.number().int().nonnegative().nullable(), on: vnDaySchema }).nullable(),
  lost: z.object({ reason: lostReasonSchema, note: z.string() }).nullable(),
  owner: contactPersonSchema.nullable(),
  contact: contactPersonSchema,
  next: opportunityNextTaskSchema.nullable(),
  stageChangedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type Opportunity = z.infer<typeof opportunitySchema>;

export const pipelineQuerySchema = z.strictObject({ ownerId: idSchema.optional() });
export type PipelineQuery = z.infer<typeof pipelineQuerySchema>;

export const pipelineColumnSchema = z.object({
  stage: opportunityStageSchema,
  count: z.number().int().nonnegative(),
  /** Sum of the expected values, or of the actual values for "Thắng". */
  total: z.number().int().nonnegative(),
  /** Most recently moved first, at most `PIPELINE_COLUMN_MAX`. */
  items: z.array(opportunitySchema),
});
export type PipelineColumn = z.infer<typeof pipelineColumnSchema>;

/**
 * The board: the four open stages, then "Thắng" and "Thua" of this month (Vietnam's calendar),
 * and the first line's numbers.
 */
export const pipelineResponseSchema = z.object({
  columns: z.array(pipelineColumnSchema),
  summary: z.object({
    open: z.number().int().nonnegative(),
    openValue: z.number().int().nonnegative(),
    wonThisMonth: z.number().int().nonnegative(),
    lostThisMonth: z.number().int().nonnegative(),
  }),
});
export type PipelineResponse = z.infer<typeof pipelineResponseSchema>;

export const createOpportunityRequestSchema = z.object({
  contactId: idSchema,
  title: opportunityTitleSchema,
  value: opportunityValueSchema.nullable(),
});
export type CreateOpportunityRequest = z.input<typeof createOpportunityRequestSchema>;

/** "Tạo cơ hội" for profiles selected on board 22, one each. */
export const bulkCreateOpportunitiesRequestSchema = z.object({
  contactIds: z.array(idSchema).min(1).max(CONTACT_BULK_MAX),
  title: opportunityTitleSchema,
  value: opportunityValueSchema.nullable(),
});
export type BulkCreateOpportunitiesRequest = z.input<typeof bulkCreateOpportunitiesRequestSchema>;

export const bulkCreateOpportunitiesResponseSchema = z.object({
  created: z.number().int().nonnegative(),
});

export const updateOpportunityRequestSchema = z
  .strictObject({
    title: opportunityTitleSchema,
    value: opportunityValueSchema.nullable(),
    ownerId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Không có thay đổi nào để lưu');
export type UpdateOpportunityRequest = z.input<typeof updateOpportunityRequestSchema>;

/**
 * "Chuyển giai đoạn" (ADR-033). "Thắng" needs the actual value and the closing day, "Thua" a
 * reason. The stage it moves from is sent too: a card moved meanwhile is a 409, not a jump.
 */
export const moveOpportunityRequestSchema = z.discriminatedUnion('stage', [
  z.strictObject({ stage: z.literal('new'), from: opportunityStageSchema }),
  z.strictObject({ stage: z.literal('contacted'), from: opportunityStageSchema }),
  z.strictObject({ stage: z.literal('scheduled'), from: opportunityStageSchema }),
  z.strictObject({ stage: z.literal('visited'), from: opportunityStageSchema }),
  z.strictObject({
    stage: z.literal('won'),
    from: opportunityStageSchema,
    value: opportunityValueSchema,
    on: vnDaySchema,
  }),
  z.strictObject({
    stage: z.literal('lost'),
    from: opportunityStageSchema,
    reason: lostReasonSchema,
    note: z.string().trim().max(LOST_NOTE_MAX, `Ghi chú tối đa ${LOST_NOTE_MAX} ký tự`),
  }),
]);
export type MoveOpportunityRequest = z.input<typeof moveOpportunityRequestSchema>;
export type MoveOpportunityValues = z.output<typeof moveOpportunityRequestSchema>;

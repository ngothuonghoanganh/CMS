import { z } from 'zod';
import { vnDaySchema, vnMonthSchema } from './calendar.js';
import { idSchema } from './common.js';
import { MAX_SECTIONS, sectionIdSchema, sectionTypeSchema } from './composition.js';
import { pageGoalSchema } from './goals.js';
import { pageTitleSchema, slugSchema } from './page.js';

/**
 * Creating a page with AI (ADR-031, board 20): a brief, a structure the user arranges, then a job
 * on the server that writes the sections and creates the draft.
 */

export const aiToneIds = ['friendly', 'professional', 'energetic'] as const;
export const aiToneSchema = z.enum(aiToneIds);
export type AiTone = z.infer<typeof aiToneSchema>;

export const aiToneLabels: Record<AiTone, string> = {
  friendly: 'Thân thiện',
  professional: 'Chuyên nghiệp',
  energetic: 'Năng động',
};

export const aiLanguageIds = ['vi', 'en'] as const;
export const aiLanguageSchema = z.enum(aiLanguageIds);
export type AiLanguage = z.infer<typeof aiLanguageSchema>;

export const aiLanguageLabels: Record<AiLanguage, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

export const AI_BRIEF_MAX = {
  product: 300,
  audience: 200,
  differentiators: 800,
  /** "Nội dung bạn đã có": pasted text only, no files (ADR-031). */
  existingContent: 4000,
} as const;

/**
 * What the AI is told about the page. Only what the user types here, the site name and the
 * draft's own text are ever sent to the AI: never leads, consent texts or personal data.
 */
export const aiBriefSchema = z.object({
  product: z
    .string()
    .trim()
    .min(1, 'Nhập sản phẩm hoặc dịch vụ')
    .max(AI_BRIEF_MAX.product, `Tối đa ${AI_BRIEF_MAX.product} ký tự`),
  audience: z
    .string()
    .trim()
    .min(1, 'Nhập khách hàng mục tiêu')
    .max(AI_BRIEF_MAX.audience, `Tối đa ${AI_BRIEF_MAX.audience} ký tự`),
  goal: pageGoalSchema,
  differentiators: z
    .string()
    .trim()
    .min(1, 'Nhập điểm khác biệt và thông điệp chính')
    .max(AI_BRIEF_MAX.differentiators, `Tối đa ${AI_BRIEF_MAX.differentiators} ký tự`),
  tone: aiToneSchema,
  language: aiLanguageSchema,
  existingContent: z
    .string()
    .trim()
    .max(AI_BRIEF_MAX.existingContent, `Tối đa ${AI_BRIEF_MAX.existingContent} ký tự`)
    .default(''),
});
export type AiBrief = z.infer<typeof aiBriefSchema>;

/** One section of the structure the user arranged: the registry checks type and variant. */
export const aiStructureItemSchema = z.object({
  type: sectionTypeSchema,
  variant: z.string().min(1).max(40),
});
export type AiStructureItem = z.infer<typeof aiStructureItemSchema>;

export const aiPageJobRequestSchema = z.object({
  title: pageTitleSchema,
  slug: slugSchema,
  brief: aiBriefSchema,
  structure: z
    .array(aiStructureItemSchema)
    .min(1, 'Trang cần ít nhất một section')
    .max(MAX_SECTIONS, `Một trang có tối đa ${MAX_SECTIONS} section`),
});
export type AiPageJobRequest = z.input<typeof aiPageJobRequestSchema>;

/** "Thử lại N section" of one job, which uses no more of the quota (ADR-031). */
export const AI_RETRIES_PER_JOB = 2;

/**
 * `kept`: the AI writes nothing in this section (the footer's address and hours, real
 * testimonials), so it keeps its sample text for the user to fill in.
 */
export const aiSectionStatusIds = ['queued', 'writing', 'done', 'failed', 'kept'] as const;
export const aiSectionStatusSchema = z.enum(aiSectionStatusIds);
export type AiSectionStatus = z.infer<typeof aiSectionStatusSchema>;

export const aiJobSectionSchema = z.object({
  id: sectionIdSchema,
  type: sectionTypeSchema,
  variant: z.string(),
  status: aiSectionStatusSchema,
});
export type AiJobSection = z.infer<typeof aiJobSectionSchema>;

/** `done` once the draft exists, every section written or some still failed (partial). */
export const aiJobStatusIds = ['running', 'done', 'failed', 'cancelled'] as const;
export const aiJobStatusSchema = z.enum(aiJobStatusIds);
export type AiJobStatus = z.infer<typeof aiJobStatusSchema>;

/** Why sections were not written, or why the job wrote no draft. */
export const aiFailureCodes = [
  'ai_overloaded',
  'ai_unavailable',
  'ai_timeout',
  'ai_invalid_output',
  /** The slug was taken by another page while the AI wrote. */
  'slug_taken',
  'page_limit_reached',
  /** The job ran past its deadline, e.g. the API restarted meanwhile. */
  'interrupted',
  /** "Thử lại": the draft was edited meanwhile, so the new text was not put in. */
  'draft_changed',
] as const;
export const aiFailureSchema = z.enum(aiFailureCodes);
export type AiFailure = z.infer<typeof aiFailureSchema>;

export const aiJobSchema = z.object({
  id: idSchema,
  status: aiJobStatusSchema,
  sections: z.array(aiJobSectionSchema),
  /** The draft the job created; null until it exists. */
  pageId: idSchema.nullable(),
  retriesLeft: z.number().int().nonnegative(),
  failure: aiFailureSchema.nullable(),
});
export type AiJob = z.infer<typeof aiJobSchema>;

/**
 * One line of the NDJSON stream of a run (`application/x-ndjson`): `started`, then each section's
 * progress, `heartbeat` while the AI is quiet (proxies close idle connections), then `finished`.
 */
export const aiJobEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), job: aiJobSchema }),
  z.object({
    type: z.literal('section'),
    sectionId: sectionIdSchema,
    status: aiSectionStatusSchema,
  }),
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('finished'), job: aiJobSchema }),
]);
export type AiJobEvent = z.infer<typeof aiJobEventSchema>;

export const AI_JOB_STREAM_TYPE = 'application/x-ndjson';

/** The workspace's AI uses of this month in Vietnam ("Còn N/100 lượt tháng này"). */
export const aiUsageSchema = z.object({
  /** False when the API runs without an AI service (`AI_PROVIDER=none`). */
  enabled: z.boolean(),
  month: vnMonthSchema,
  limit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** The first day of next month, when the uses come back. */
  resetsOn: vnDaySchema,
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

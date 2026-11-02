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

/*
 * The assistant in the editor (ADR-031, board 21): suggestions for the text of a field, a section
 * or the page. A request never changes the draft; the editor applies what the user accepts.
 */

/** "Hoặc mô tả bạn muốn": the free request, or extra guidance for a chip. */
export const AI_INSTRUCTION_MAX = 300;

/**
 * The chips of board 21, then the free request (`custom`). Each writes some of the scope's text:
 * every field the AI may write, the headings only ("Gợi ý tiêu đề"), the button labels only
 * ("Gợi ý CTA"), or the page's SEO title and description ("Gợi ý SEO").
 */
export const aiAssistActionIds = [
  'rewrite',
  'shorten',
  'change_tone',
  'suggest_heading',
  'suggest_cta',
  'write_section',
  'suggest_seo',
  'custom',
] as const;
export const aiAssistActionSchema = z.enum(aiAssistActionIds);
export type AiAssistAction = z.infer<typeof aiAssistActionSchema>;

export const aiAssistActionLabels: Record<AiAssistAction, string> = {
  rewrite: 'Viết lại',
  shorten: 'Rút gọn',
  change_tone: 'Đổi giọng văn',
  suggest_heading: 'Gợi ý tiêu đề',
  suggest_cta: 'Gợi ý CTA',
  write_section: 'Viết nội dung section',
  suggest_seo: 'Gợi ý SEO',
  custom: 'Yêu cầu riêng',
};

/** A content path of a section, e.g. "heading", "primaryCta.label" or "items.1.answer". */
export const contentPathSchema = z
  .string()
  .max(200)
  .regex(
    /^[A-Za-z][A-Za-z0-9]*(\.(\d+|[A-Za-z][A-Za-z0-9]*))*$/,
    'Đường dẫn nội dung không hợp lệ',
  );

/** "Đoạn chữ" (one field), "Section …" (the selected section) or "Toàn trang". */
export const aiSuggestionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field'), sectionId: sectionIdSchema, path: contentPathSchema }),
  z.object({ kind: z.literal('section'), sectionId: sectionIdSchema }),
  z.object({ kind: z.literal('page') }),
]);
export type AiSuggestionScope = z.infer<typeof aiSuggestionScopeSchema>;

/** Longer than any text field of the registry, which checks each field's own limit. */
const SCOPE_TEXT_MAX = 2000;

/**
 * The text of one section of the scope as the editor holds it now, unsaved changes included: the
 * paths the AI may write there (`aiWritablePaths` of `@plp/sections`) and their text. The API
 * refuses any other path, so links, phone numbers and images never leave the editor this way.
 */
export const aiScopeSectionSchema = z.object({
  id: sectionIdSchema,
  type: sectionTypeSchema,
  variant: z.string().min(1).max(40),
  texts: z.record(contentPathSchema, z.string().max(SCOPE_TEXT_MAX)),
});
export type AiScopeSection = z.infer<typeof aiScopeSectionSchema>;

/** The page's SEO texts, which "Gợi ý SEO" writes again from the page text. */
export const aiScopeSeoSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(400),
});
export type AiScopeSeo = z.infer<typeof aiScopeSeoSchema>;

export const aiSuggestionRequestSchema = z
  .object({
    scope: aiSuggestionScopeSchema,
    action: aiAssistActionSchema,
    /** The tone "Đổi giọng văn" writes in. */
    tone: aiToneSchema.optional(),
    instruction: z
      .string()
      .trim()
      .max(AI_INSTRUCTION_MAX, `Tối đa ${AI_INSTRUCTION_MAX} ký tự`)
      .default(''),
    /** The sections of the scope: the one of a field or section scope, every one for the page. */
    sections: z.array(aiScopeSectionSchema).max(MAX_SECTIONS),
    seo: aiScopeSeoSchema.optional(),
  })
  .superRefine((request, ctx) => {
    if (request.action === 'custom' && request.instruction === '') {
      ctx.addIssue({ code: 'custom', path: ['instruction'], message: 'Nhập yêu cầu cho trợ lý' });
    }
    if (request.action === 'change_tone' && request.tone === undefined) {
      ctx.addIssue({ code: 'custom', path: ['tone'], message: 'Chọn giọng văn' });
    }
    if (request.action === 'suggest_seo') {
      if (request.scope.kind !== 'page') {
        ctx.addIssue({
          code: 'custom',
          path: ['scope'],
          message: 'Gợi ý SEO dùng chữ của toàn trang',
        });
      }
      if (request.seo === undefined) {
        ctx.addIssue({ code: 'custom', path: ['seo'], message: 'Thiếu tiêu đề và mô tả SEO' });
      }
    }
  });
export type AiSuggestionRequest = z.input<typeof aiSuggestionRequestSchema>;

/** Where a suggestion goes: a section of the draft, or its SEO (`title`, `description`). */
export const AI_SEO_TARGET = 'seo';
export const aiSuggestionTargetSchema = z.union([sectionIdSchema, z.literal(AI_SEO_TARGET)]);

/**
 * One text of the scope. `ok`: the AI's new text, parsed by the registry, with `review` when it
 * states a figure, a price or a claim to check. `failed`: the AI wrote nothing usable there
 * ("Chưa viết được phần này").
 */
export const aiSuggestionChangeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    sectionId: aiSuggestionTargetSchema,
    path: contentPathSchema,
    before: z.string(),
    after: z.string(),
    review: z.boolean(),
  }),
  z.object({
    status: z.literal('failed'),
    sectionId: aiSuggestionTargetSchema,
    path: contentPathSchema,
    before: z.string(),
    failure: aiFailureSchema,
  }),
]);
export type AiSuggestionChange = z.infer<typeof aiSuggestionChangeSchema>;

export const aiSuggestionResultSchema = z.object({
  /** In the order of the scope, section by section and field by field; unchanged text is left out. */
  changes: z.array(aiSuggestionChangeSchema),
  /** One use was spent: at least one `ok` change came back. */
  charged: z.boolean(),
  /** Why the AI wrote nothing usable, when no `ok` change came back because of it; else null. */
  failure: aiFailureSchema.nullable(),
  usage: aiUsageSchema,
});
export type AiSuggestionResult = z.infer<typeof aiSuggestionResultSchema>;

/**
 * One line of the NDJSON answer of a suggestion request (`AI_JOB_STREAM_TYPE`): `heartbeat` while
 * the AI writes (proxies close quiet connections), then the `result`.
 */
export const aiSuggestionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('result'), result: aiSuggestionResultSchema }),
]);
export type AiSuggestionEvent = z.infer<typeof aiSuggestionEventSchema>;

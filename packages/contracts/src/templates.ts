import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { compositionSchema, sectionTypeSchema } from './composition.js';
import { pageGoalSchema } from './goals.js';
import { colorSchemeIdSchema } from './themes.js';

/**
 * Where a template comes from (ADR-030). The system templates live in code; the workspace's own
 * templates join as `workspace` with slice G2, in the same list and the same create request.
 */
export const templateSources = ['system'] as const;
export const templateSourceSchema = z.enum(templateSources);
export type TemplateSource = z.infer<typeof templateSourceSchema>;

export const templateSourceLabels: Record<TemplateSource, string> = {
  system: 'Hệ thống',
};

/** The industries of the filter of board 17. */
export const templateIndustries = [
  'dental_health',
  'spa_beauty',
  'education',
  'real_estate',
  'food_beverage',
  'fitness',
] as const;
export const templateIndustrySchema = z.enum(templateIndustries);
export type TemplateIndustry = z.infer<typeof templateIndustrySchema>;

export const templateIndustryLabels: Record<TemplateIndustry, string> = {
  dental_health: 'Nha khoa & y tế',
  spa_beauty: 'Spa & làm đẹp',
  education: 'Giáo dục',
  real_estate: 'Bất động sản',
  food_beverage: 'Nhà hàng & F&B',
  fitness: 'Thể hình',
};

/**
 * A system template's id: kebab-case with at least one hyphen ("nha-khoa-uu-dai"). It is stable
 * across versions, and never reads as an ObjectId, so one path segment names a system template or
 * (from G2) a workspace template without saying which.
 */
export const systemTemplateIdSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)+$/, 'Mã mẫu không hợp lệ');

/** Bumped whenever a template's content changes; a page records the version it was made from. */
export const templateVersionSchema = z.number().int().positive();

/** One section of a template, as its outline ("Gồm 8 section") and its thumbnail draw it. */
export const templateSectionSchema = z.object({
  type: sectionTypeSchema,
  variant: z.string(),
  colorScheme: colorSchemeIdSchema,
  /** What the section does on this page: "Hero · ưu đãi và nút đặt lịch". */
  label: z.string(),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

/** A card of the library (board 17). */
export const templateSummarySchema = z.object({
  id: z.string(),
  source: templateSourceSchema,
  version: templateVersionSchema,
  /** When this version was made. */
  updatedAt: isoDateTimeSchema,
  name: z.string(),
  /** One line for the card. */
  description: z.string(),
  goal: pageGoalSchema,
  industry: templateIndustrySchema,
  /** The template has the lead form: "Có form", and the site needs its consent and recipients. */
  hasForm: z.boolean(),
  sections: z.array(templateSectionSchema),
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/** Every template the member may use; bounded (12 system templates, ADR-030 caps the rest). */
export const templateListResponseSchema = z.object({
  items: z.array(templateSummarySchema),
});
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>;

export const templateDetailQuerySchema = z.object({
  /** The site the page would be made for: the answer then says what it still needs. */
  siteId: idSchema.optional(),
});
export type TemplateDetailQuery = z.infer<typeof templateDetailQuerySchema>;

/** What a page with a form still misses in the site before it can be published (ADR-016/017). */
export const consentGapSchema = z.enum(['privacy', 'consent']);
export type ConsentGap = z.infer<typeof consentGapSchema>;

/** "Cần có trước khi xuất bản" for one site (board 18). */
export const templateSiteReadinessSchema = z.object({
  siteId: idSchema,
  /** Addresses that receive the site's leads now (confirmed, ADR-018). */
  confirmedRecipients: z.number().int().nonnegative(),
  /** The first of them, for roles that see lead recipients (`leads.view`); null otherwise. */
  recipientEmail: z.string().nullable(),
  /** The consent text version a form would show now; null while there is none (ADR-017). */
  consentVersion: z.number().int().positive().nullable(),
  /** Empty when a form could be published as far as consent goes. */
  consentGaps: z.array(consentGapSchema),
});
export type TemplateSiteReadiness = z.infer<typeof templateSiteReadinessSchema>;

/** Board 18: the template, its preview and what the chosen site still needs. */
export const templateDetailSchema = templateSummarySchema.extend({
  /** What the template is for, under its name. */
  details: z.string(),
  /** The page a new draft starts from, with sample ids: for the preview only. */
  composition: compositionSchema,
  /** Pages made from this template, any version, in the sites the member may open. */
  usedCount: z.number().int().nonnegative(),
  /** For the `siteId` asked for; null without one. */
  site: templateSiteReadinessSchema.nullable(),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;

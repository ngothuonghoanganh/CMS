import { z } from 'zod';
import { assetSchema } from './asset.js';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { compositionSchema, sectionTypeSchema } from './composition.js';
import { pageGoalSchema } from './goals.js';
import { publicImageSchema } from './public.js';
import { colorSchemeIdSchema } from './themes.js';

/**
 * Where a template comes from (ADR-030): the system templates live in code, the workspace's own
 * in its database. Both are in the same library and the same create request.
 */
export const templateSources = ['system', 'workspace'] as const;
export const templateSourceSchema = z.enum(templateSources);
export type TemplateSource = z.infer<typeof templateSourceSchema>;

export const templateSourceLabels: Record<TemplateSource, string> = {
  system: 'Hệ thống',
  workspace: 'Workspace',
};

/** At most this many templates in a workspace, archived ones included: no list is unbounded. */
export const MAX_WORKSPACE_TEMPLATES = 100;
/** At most this many versions of one workspace template. */
export const MAX_TEMPLATE_VERSIONS = 50;

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
 * a workspace template without saying which (`isWorkspaceTemplateId`).
 */
export const systemTemplateIdSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)+$/, 'Mã mẫu không hợp lệ');

/** Bumped whenever a template's content changes; a page records the version it was made from. */
export const templateVersionSchema = z.number().int().positive();

/**
 * A template at the version the user previewed: a system template by its kebab-case id, or a
 * workspace template by its ObjectId (ADR-030). A newer version is refused (409
 * `template_changed`) rather than used unseen.
 */
export const templateRefSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('system'),
    templateId: systemTemplateIdSchema,
    version: templateVersionSchema,
  }),
  z.object({
    source: z.literal('workspace'),
    templateId: idSchema,
    version: templateVersionSchema,
  }),
]);
export type TemplateRef = z.infer<typeof templateRefSchema>;

/**
 * Whether a template's id names a workspace template (24 hex digits) rather than a system one,
 * whose ids always hold a hyphen.
 */
export function isWorkspaceTemplateId(templateId: string): boolean {
  return idSchema.safeParse(templateId).success;
}

/**
 * Whether a template may be used in a site: a workspace template limited to some sites only in
 * those (ADR-030). `siteIds` null is every site of the workspace, as for the system templates.
 */
export function templateUsableIn(siteIds: readonly string[] | null, siteId: string): boolean {
  return siteIds === null || siteIds.includes(siteId);
}

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
  /** Always set for a system template; a workspace template may leave it open. */
  goal: pageGoalSchema.nullable(),
  industry: templateIndustrySchema.nullable(),
  /** The template has the lead form: "Có form", and the site needs its consent and recipients. */
  hasForm: z.boolean(),
  sections: z.array(templateSectionSchema),
  /**
   * The sites a workspace template may be used in (`templateUsableIn`); null for every site of the
   * workspace, and for the system templates.
   */
  siteIds: z.array(idSchema).nullable(),
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/**
 * Every template the member may use: the system templates, then the workspace's own that are not
 * archived and that a site of the member may use. Bounded (12 + `MAX_WORKSPACE_TEMPLATES`).
 */
export const templateListResponseSchema = z.object({
  items: z.array(templateSummarySchema),
});
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>;

export const templateDetailQuerySchema = z.object({
  /** The site the page would be made for: the answer then says what it still needs. */
  siteId: idSchema.optional(),
  /**
   * An earlier version of a workspace template, for "Xem trước" of its version history (board 19);
   * the current one when absent. A system template keeps its current version only.
   */
  version: z.coerce.number().int().positive().optional(),
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
  /** The version pages are made from now; `version` is the one shown, this or an earlier one. */
  currentVersion: templateVersionSchema,
  /** A workspace template that was archived: it is shown, but nothing is made from it. */
  archived: z.boolean(),
  /** The page a new draft starts from, with sample ids: for the preview only. */
  composition: compositionSchema,
  /** The template's own copies of its images, by the asset id its composition uses (ADR-030). */
  images: z.record(z.string(), publicImageSchema),
  /** Pages made from this template, any version, in the sites the member may open. */
  usedCount: z.number().int().nonnegative(),
  /** For the `siteId` asked for; null without one. */
  site: templateSiteReadinessSchema.nullable(),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;

/*
 * The workspace's own templates (board 19, ADR-030): saved from a page, with immutable versions,
 * limited to some sites or not, archived instead of deleted.
 */

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên template')
  .max(120, 'Tên template tối đa 120 ký tự');

export const templateDescriptionSchema = z.string().trim().max(300, 'Mô tả tối đa 300 ký tự');

/** "Có gì mới trong phiên bản này". */
export const templateNoteSchema = z.string().trim().max(200, 'Ghi chú tối đa 200 ký tự');

/** "Ai được dùng": every site of the workspace, or the sites chosen. */
export const templateScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace') }),
  z.object({
    kind: z.literal('sites'),
    siteIds: z
      .array(idSchema)
      .min(1, 'Chọn ít nhất một site')
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Mỗi site chỉ chọn một lần'),
  }),
]);
export type TemplateScope = z.infer<typeof templateScopeSchema>;

/**
 * "Đánh dấu toàn bộ chữ là chữ mẫu" (`sample`: every text is kept and marked as sample, the image
 * frames are emptied, as in a system template) or "Giữ chữ và ảnh như hiện tại" (`keep`).
 */
export const templateContentModeSchema = z.enum(['sample', 'keep']);
export type TemplateContentMode = z.infer<typeof templateContentModeSchema>;

/** The page a version is saved from, and which of its states: the live release or the draft. */
export const templateSourcePageSchema = z.object({
  siteId: idSchema,
  pageId: idSchema,
  kind: z.enum(['live', 'draft']),
});
export type TemplateSourcePage = z.infer<typeof templateSourcePageSchema>;

const savedContentFields = {
  source: templateSourcePageSchema,
  content: templateContentModeSchema,
  note: templateNoteSchema,
};

const templateInfoFields = {
  name: templateNameSchema,
  description: templateDescriptionSchema,
  goal: pageGoalSchema.nullable(),
  industry: templateIndustrySchema.nullable(),
  scope: templateScopeSchema,
};

/** "Lưu trang thành template" as a new template: its v1. */
export const createWorkspaceTemplateRequestSchema = z.object({
  ...savedContentFields,
  ...templateInfoFields,
});
export type CreateWorkspaceTemplateRequest = z.input<typeof createWorkspaceTemplateRequestSchema>;

/**
 * "Lưu trang thành template" as a new version of a template, which `baseVersion` must still be
 * the current version of (409 `template_changed` otherwise). The name may change with it.
 */
export const createTemplateVersionRequestSchema = z.object({
  ...savedContentFields,
  name: templateNameSchema,
  baseVersion: templateVersionSchema,
});
export type CreateTemplateVersionRequest = z.input<typeof createTemplateVersionRequestSchema>;

/** "Sửa thông tin". */
export const updateWorkspaceTemplateRequestSchema = z.object(templateInfoFields);
export type UpdateWorkspaceTemplateRequest = z.input<typeof updateWorkspaceTemplateRequestSchema>;

/** "Dùng lại vN": a new version with vN's content, on top of `baseVersion`. */
export const reuseTemplateVersionRequestSchema = z.object({ baseVersion: templateVersionSchema });
export type ReuseTemplateVersionRequest = z.infer<typeof reuseTemplateVersionRequestSchema>;

/** A row of board 19. */
export const workspaceTemplateSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  goal: pageGoalSchema.nullable(),
  industry: templateIndustrySchema.nullable(),
  /** "AI ĐƯỢC DÙNG". Deleting a site takes it out of the list (ADR-027), which may then be empty. */
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('workspace') }),
    z.object({ kind: z.literal('sites'), siteIds: z.array(idSchema) }),
  ]),
  currentVersion: templateVersionSchema,
  /** Archived templates are out of the library; pages made from them are not touched. */
  archived: z.boolean(),
  /** "ĐÃ TẠO": pages made from any version, in the sites the member may open. */
  usedCount: z.number().int().nonnegative(),
  hasForm: z.boolean(),
  /** Of the current version, for the thumbnail. */
  sections: z.array(templateSectionSchema),
  createdBy: userRefSchema,
  /** "CẬP NHẬT": a version saved, the information edited, archived or restored. */
  updatedAt: isoDateTimeSchema,
  updatedBy: userRefSchema,
});
export type WorkspaceTemplate = z.infer<typeof workspaceTemplateSchema>;

/** Every workspace template the member may see, archived ones too (`MAX_WORKSPACE_TEMPLATES`). */
export const workspaceTemplateListResponseSchema = z.object({
  items: z.array(workspaceTemplateSchema),
});
export type WorkspaceTemplateListResponse = z.infer<typeof workspaceTemplateListResponseSchema>;

/** One version in "Lịch sử phiên bản" (board 19). */
export const templateVersionItemSchema = z.object({
  version: templateVersionSchema,
  note: z.string(),
  /**
   * The page it was saved from, with its title then. Both null for a member who does not open the
   * page's site (ADR-020): the admin says "một trang ở site khác".
   */
  source: z.object({
    pageId: idSchema.nullable(),
    pageTitle: z.string().nullable(),
    kind: z.enum(['live', 'draft']),
  }),
  /** "Dùng lại vN": the version whose content it took; null for a version saved from a page. */
  reusedFrom: templateVersionSchema.nullable(),
  createdBy: userRefSchema,
  createdAt: isoDateTimeSchema,
  /** Pages made from this version, in the sites the member may open. */
  usedCount: z.number().int().nonnegative(),
});
export type TemplateVersionItem = z.infer<typeof templateVersionItemSchema>;

/** Newest first; at most `MAX_TEMPLATE_VERSIONS`. */
export const templateVersionListResponseSchema = z.object({
  items: z.array(templateVersionItemSchema),
});
export type TemplateVersionListResponse = z.infer<typeof templateVersionListResponseSchema>;

/** "Thay toàn bộ section" from board 18: the draft's sections replaced, at `baseRevision`. */
export const applyTemplateRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  template: templateRefSchema,
});
export type ApplyTemplateRequest = z.infer<typeof applyTemplateRequestSchema>;

/**
 * "Áp dụng mẫu…" in the editor: the template's sections made ready for the page's site, its images
 * copied as the site's assets. The editor applies them with one command, then autosaves (ADR-008).
 */
export const templateCompositionResponseSchema = z.object({
  composition: compositionSchema,
  /** The site's new assets the composition uses, for the canvas. */
  assets: z.array(assetSchema),
  template: z.object({ name: z.string(), version: templateVersionSchema }),
});
export type TemplateCompositionResponse = z.infer<typeof templateCompositionResponseSchema>;

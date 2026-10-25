import { z } from 'zod';
import { checkCountsSchema, checksResultSchema } from './checks.js';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { compositionSchema } from './composition.js';
import { briefSchema, pageGoalSchema, pageStyleSchema } from './goals.js';

/**
 * Paths the renderer answers itself, so a page published there could never be served at its URL:
 * the renderer's own routes (`_preview`, `_lead`, `api`, `healthz`, sitemap, robots) and the
 * paths Next keeps for itself (`_next`, `index` is `/`, `404` and `500` are its error pages).
 */
export const reservedSlugs: readonly string[] = [
  '_preview',
  '_lead',
  '_next',
  'api',
  'healthz',
  'index',
  '404',
  '500',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
];

/** "" is the home page; otherwise one lowercase kebab-case segment. */
export const slugSchema = z
  .string()
  .trim()
  .max(80, 'Đường dẫn tối đa 80 ký tự')
  .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang')
  .refine((value) => !reservedSlugs.includes(value), 'Đường dẫn này được hệ thống giữ lại');

export const SEO_TITLE_RECOMMENDED_MAX = 60;
export const SEO_DESCRIPTION_RECOMMENDED_MAX = 160;
/** Upper bound on pages per site keeps every per-site computation bounded. */
export const MAX_PAGES_PER_SITE = 200;

export const seoSchema = z.object({
  title: z.string().trim().max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().trim().max(400, 'Mô tả tối đa 400 ký tự'),
  shareImageAssetId: idSchema.nullable(),
  noindex: z.boolean(),
});
export type Seo = z.infer<typeof seoSchema>;

export const EMPTY_SEO: Seo = {
  title: '',
  description: '',
  shareImageAssetId: null,
  noindex: false,
};

export const pageTitleSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên trang')
  .max(120, 'Tên trang tối đa 120 ký tự');

/**
 * Section changes, SEO fields and the slug come from the draft; `site` is a site look setting
 * that differs from the snapshot a release was published with (ADR-015), `privacy` a personal
 * data or consent setting that differs from the snapshot of a page with a form (ADR-017).
 */
export const changeKinds = [
  'added',
  'removed',
  'modified',
  'moved',
  'seo',
  'slug',
  'site',
  'privacy',
] as const;

export const changeItemSchema = z.object({
  kind: z.enum(changeKinds),
  /** Human label as shown on chips, e.g. "Sửa: Hero", "SEO: tiêu đề" or "Giao diện site: logo". */
  label: z.string(),
  sectionId: z.string().nullable(),
});
export type ChangeItem = z.infer<typeof changeItemSchema>;

export const pageStatusKindSchema = z.enum(['draft', 'live', 'live_with_changes', 'unpublished']);
export type PageStatusKind = z.infer<typeof pageStatusKindSchema>;

export const pageStatusLabels: Record<PageStatusKind, string> = {
  draft: 'Bản nháp',
  live: 'Live',
  live_with_changes: 'Live · Có thay đổi',
  unpublished: 'Đã gỡ',
};

/** Always derived on the server from the draft revision and the live release; never stored. */
export const pageStatusSchema = z.object({
  kind: pageStatusKindSchema,
  changeCount: z.number().int().nonnegative(),
  changes: z.array(changeItemSchema),
});
export type PageStatus = z.infer<typeof pageStatusSchema>;

export const pointerEventSchema = z.object({
  type: z.enum(['published', 'rolled_back', 'rollback_undone', 'unpublished']),
  /** Version that became live; null when the page was unpublished. */
  version: z.number().int().positive().nullable(),
  by: userRefSchema,
  at: isoDateTimeSchema,
});
export type PointerEvent = z.infer<typeof pointerEventSchema>;

export const liveReleaseRefSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  slug: z.string(),
  publishedAt: isoDateTimeSchema,
});
export type LiveReleaseRef = z.infer<typeof liveReleaseRefSchema>;

export const pageSummarySchema = z.object({
  id: idSchema,
  siteId: idSchema,
  title: z.string(),
  /** Draft slug. */
  slug: z.string(),
  goal: pageGoalSchema.nullable(),
  status: pageStatusSchema,
  /**
   * Site settings that differ from the snapshot the live release was published with: the look
   * (theme, logo, name, default share image; kind `site`, ADR-015) and, for a page with a form,
   * the consent text, business name and policy link (kind `privacy`, ADR-017). The live page keeps
   * that snapshot until the page is published again, so these are reminders, not part of the
   * status (rule 2 compares revisions only). Empty when nothing is live or nothing differs;
   * derived on the server, never stored.
   */
  siteChanges: z.array(changeItemSchema),
  liveRelease: liveReleaseRefSchema.nullable(),
  /** Number of releases ever created (the latest version number). */
  latestVersion: z.number().int().nonnegative(),
  lastPointerEvent: pointerEventSchema.nullable(),
  /** Public URL of the live page, null when nothing is live. */
  liveUrl: z.url().nullable(),
  checks: checkCountsSchema,
  createdBy: userRefSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

/** A row of the page list (screen 01): the summary and its column "LEAD 7 NGÀY". */
export const pageListItemSchema = pageSummarySchema.extend({
  /** Leads of the last 7 days in Vietnam, spam excluded (ADR-018). */
  leadsLast7Days: z.number().int().nonnegative(),
});
export type PageListItem = z.infer<typeof pageListItemSchema>;

export const draftSchema = z.object({
  slug: z.string(),
  composition: compositionSchema,
  seo: seoSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
  updatedBy: userRefSchema,
});
export type Draft = z.infer<typeof draftSchema>;

export const pageDetailResponseSchema = z.object({
  page: pageSummarySchema,
  draft: draftSchema,
  checks: checksResultSchema,
});
export type PageDetailResponse = z.infer<typeof pageDetailResponseSchema>;

export const pageListQuerySchema = z.object({
  /**
   * `live` lists every page that is currently live, with or without unpublished changes;
   * `live_with_changes` lists only the live pages whose draft differs from the live release.
   */
  status: pageStatusKindSchema.optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

/**
 * Page counts of the dashboard chips ("Tất cả · 6", "Live · 3", "Có thay đổi · 1", …). They match
 * the `status` filter of `pageListQuerySchema`, so the chips overlap like the filters do:
 * `live` = pages with status `live` + pages with status `live_with_changes` (everything currently
 * live), and `live_with_changes` is the subset of those with unpublished changes.
 */
export const pageCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  live: z.number().int().nonnegative(),
  live_with_changes: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  unpublished: z.number().int().nonnegative(),
});
export type PageCounts = z.infer<typeof pageCountsSchema>;

export const pageListResponseSchema = z.object({
  items: z.array(pageListItemSchema),
  nextCursor: z.string().nullable(),
  /** Counts over every page of the site, independent of the filter. */
  counts: pageCountsSchema,
  attention: z.object({
    pagesWithChanges: z.number().int().nonnegative(),
    pagesWithBlockingErrors: z.number().int().nonnegative(),
    /** The most recently edited page that needs attention, for the dashboard shortcut. */
    firstPage: z.object({ id: idSchema, title: z.string() }).nullable(),
  }),
});
export type PageListResponse = z.infer<typeof pageListResponseSchema>;

export const createPageRequestSchema = z.object({
  title: pageTitleSchema,
  slug: slugSchema,
  start: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('blank') }),
    z.object({
      kind: z.literal('goal'),
      goal: pageGoalSchema,
      brief: briefSchema,
      style: pageStyleSchema,
    }),
  ]),
});
export type CreatePageRequest = z.input<typeof createPageRequestSchema>;

export const saveDraftRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  slug: slugSchema,
  composition: compositionSchema,
  seo: seoSchema,
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

export const saveDraftResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
  page: pageSummarySchema,
  checks: checksResultSchema,
});
export type SaveDraftResponse = z.infer<typeof saveDraftResponseSchema>;

export const restoreDraftRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  releaseId: idSchema,
});
export type RestoreDraftRequest = z.infer<typeof restoreDraftRequestSchema>;

/** How many pages a site holds, without evaluating them (the sidebar count). */
export const pageCountResponseSchema = z.object({ count: z.number().int().nonnegative() });
export type PageCountResponse = z.infer<typeof pageCountResponseSchema>;

export const slugAvailabilityQuerySchema = z.object({
  slug: z.string().max(100),
  /** The page being edited; its own slugs never conflict with themselves. */
  pageId: idSchema.optional(),
});

export const slugAvailabilitySchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved', 'taken']).nullable(),
  message: z.string().nullable(),
});
export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;

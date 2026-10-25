import { z } from 'zod';
import { cursorQuerySchema, idSchema, isoDateTimeSchema, userRefSchema } from './common.js';

export const activityTypes = [
  'site.created',
  'page.created',
  'page.published',
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
  'page.draft_restored',
  'asset.uploaded',
  'privacy.updated',
  'consent.version_created',
] as const;
export const activityTypeSchema = z.enum(activityTypes);
export type ActivityType = z.infer<typeof activityTypeSchema>;

/**
 * Events that move a page's live pointer (publish, rollback, undo, unpublish): the publishing
 * history a site shows, e.g. "Hoạt động xuất bản gần đây" on the dashboard.
 */
export const publishingActivityTypes = [
  'page.published',
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
] as const satisfies readonly ActivityType[];

export const activityListQuerySchema = cursorQuerySchema.extend({
  /**
   * Comma-separated types to list, e.g. `publishingActivityTypes.join(',')`; every type when
   * absent.
   */
  types: z
    .string()
    .max(300)
    .transform((value) => value.split(','))
    // Splitting always yields at least one item; an empty value fails as an unknown type.
    .pipe(z.array(activityTypeSchema))
    .optional(),
});
export type ActivityListQuery = z.input<typeof activityListQuerySchema>;

export const activityItemSchema = z.object({
  id: idSchema,
  type: activityTypeSchema,
  actor: userRefSchema,
  siteId: idSchema,
  page: z.object({ id: idSchema, title: z.string() }).nullable(),
  /**
   * Versions involved: `version` for publish/restore and for a new consent text version,
   * `from`/`to` for pointer moves.
   */
  data: z.object({
    version: z.number().int().positive().nullable(),
    fromVersion: z.number().int().positive().nullable(),
    toVersion: z.number().int().positive().nullable(),
    revalidationFailed: z.boolean(),
  }),
  reason: z.string().nullable(),
  undoable: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const activityListResponseSchema = z.object({
  items: z.array(activityItemSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;

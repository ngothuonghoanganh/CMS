import { z } from 'zod';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';

export const activityTypes = [
  'site.created',
  'page.created',
  'page.published',
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
  'page.draft_restored',
  'asset.uploaded',
] as const;
export const activityTypeSchema = z.enum(activityTypes);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const activityItemSchema = z.object({
  id: idSchema,
  type: activityTypeSchema,
  actor: userRefSchema,
  siteId: idSchema,
  page: z.object({ id: idSchema, title: z.string() }).nullable(),
  /** Versions involved: `version` for publish/restore, `from`/`to` for pointer moves. */
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

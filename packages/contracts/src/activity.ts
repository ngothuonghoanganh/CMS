import { z } from 'zod';
import { cursorQuerySchema, idSchema, isoDateTimeSchema, userRefSchema } from './common.js';

export const activityTypes = [
  'site.created',
  'page.created',
  'page.created_from_template',
  'page.published',
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
  'page.draft_restored',
  'page.template_applied',
  'page.deleted',
  'template.saved',
  'asset.uploaded',
  'privacy.updated',
  'consent.version_created',
  'lead.exported',
  'lead.person_deleted',
  'lead.recipients_changed',
  'data_request.created',
  'data_request.completed',
  'domain.added',
  'domain.removed',
  'domain.primary_changed',
  'domain.activated',
  'domain.lost',
] as const;
export const activityTypeSchema = z.enum(activityTypes);
export type ActivityType = z.infer<typeof activityTypeSchema>;

/**
 * Events of a site's custom domains (ADR-022); their `data` holds the hostname only. Members add,
 * remove and choose the primary address; the domain checks find it active or lost.
 */
export const domainActivityTypes = [
  'domain.added',
  'domain.removed',
  'domain.primary_changed',
  'domain.activated',
  'domain.lost',
] as const satisfies readonly ActivityType[];

/**
 * Events no member does: the domain checks record them, with no actor ("Hệ thống"). Every other
 * event has the member who did it.
 */
export const systemActivityTypes = [
  'domain.activated',
  'domain.lost',
] as const satisfies readonly ActivityType[];
export type SystemActivityType = (typeof systemActivityTypes)[number];

export function isSystemActivityType(type: ActivityType): type is SystemActivityType {
  return (systemActivityTypes as readonly ActivityType[]).includes(type);
}

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
  /** Who did it; null for the events of `systemActivityTypes`, which the admin calls "Hệ thống". */
  actor: userRefSchema.nullable(),
  siteId: idSchema,
  /**
   * The page the event is about, with its title then. `deleted`: the page was deleted since
   * (ADR-027), so nothing links to it.
   */
  page: z.object({ id: idSchema, title: z.string(), deleted: z.boolean() }).nullable(),
  /**
   * Versions involved: `version` for publish/restore and for a new consent text version,
   * `from`/`to` for pointer moves. `count` is how many leads an export, a deletion or a completed
   * data request covered, or how many addresses receive leads after a change; activity never holds
   * personal data (rule 10). `slug` is the address a deleted page had (`page.deleted`).
   * `hostname` is the domain of a domain event, or the default address made primary again.
   * `template` is the name of the template a page was made from, applied to its draft or saved
   * from it (`template.saved`), with the template's version in `version` (ADR-030).
   */
  data: z.object({
    version: z.number().int().positive().nullable(),
    fromVersion: z.number().int().positive().nullable(),
    toVersion: z.number().int().positive().nullable(),
    count: z.number().int().nonnegative().nullable(),
    slug: z.string().nullable(),
    hostname: z.string().nullable(),
    template: z.string().nullable(),
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

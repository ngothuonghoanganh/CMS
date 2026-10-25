import { z } from 'zod';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { changeItemSchema, pageSummarySchema } from './page.js';

export const releaseSummarySchema = z.object({
  id: idSchema,
  pageId: idSchema,
  version: z.number().int().positive(),
  slug: z.string(),
  note: z.string(),
  changeSummary: z.array(changeItemSchema),
  sourceRevision: z.number().int().nonnegative(),
  createdBy: userRefSchema,
  createdAt: isoDateTimeSchema,
});
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;

export const revalidationResultSchema = z.enum(['ok', 'failed']);
export type RevalidationResult = z.infer<typeof revalidationResultSchema>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z.string().min(8).max(100);

export const publishRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  expectedPublishedReleaseId: idSchema.nullable(),
  /** Fingerprints of the warnings the user chose to skip for this publish. */
  acknowledgedWarnings: z.array(z.string().max(300)).max(100),
  note: z.string().trim().max(200, 'Ghi chú tối đa 200 ký tự'),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;

export const publishResponseSchema = z.object({
  release: releaseSummarySchema,
  page: pageSummarySchema,
  liveUrl: z.url(),
  revalidation: revalidationResultSchema,
});
export type PublishResponse = z.infer<typeof publishResponseSchema>;

export const pointerMoveRequestSchema = z.object({
  /** Release to make live; null unpublishes the page. */
  targetReleaseId: idSchema.nullable(),
  expectedCurrentReleaseId: idSchema.nullable(),
  reason: z.string().trim().min(1, 'Nhập lý do').max(300, 'Lý do tối đa 300 ký tự'),
});
export type PointerMoveRequest = z.infer<typeof pointerMoveRequestSchema>;

export const pointerMoveResponseSchema = z.object({
  activityId: idSchema,
  page: pageSummarySchema,
  revalidation: revalidationResultSchema,
});
export type PointerMoveResponse = z.infer<typeof pointerMoveResponseSchema>;

export const historyEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('release'),
    release: releaseSummarySchema,
  }),
  z.object({
    kind: z.literal('pointer'),
    activityId: idSchema,
    type: z.enum(['rolled_back', 'rollback_undone', 'unpublished']),
    fromVersion: z.number().int().positive().nullable(),
    toVersion: z.number().int().positive().nullable(),
    reason: z.string().nullable(),
    by: userRefSchema,
    at: isoDateTimeSchema,
    undoable: z.boolean(),
  }),
]);
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyResponseSchema = z.object({
  /** Newest first: releases and pointer moves interleaved by time. */
  items: z.array(historyEntrySchema),
  nextCursor: z.string().nullable(),
  liveReleaseId: idSchema.nullable(),
  releaseCount: z.number().int().nonnegative(),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

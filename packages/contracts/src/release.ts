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
  /**
   * The release has a lead form. Its leads go to the site's recipients of the moment, which no
   * release holds (ADR-018): screen 06 says so before a rollback (ADR-006).
   */
  capturesLeads: z.boolean(),
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
  /**
   * Labels of the site-settings chips the user saw (`PageSummary.siteChanges`). The release freezes
   * the site settings read at publish; when they no longer give these chips, publish answers 409
   * `site_changed` rather than make live a look nobody reviewed (ADR-015).
   */
  acknowledgedSiteChanges: z.array(z.string().max(100)).max(10).default([]),
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

/** A request to publish the saved draft, from a role that cannot publish (ADR-023). */
export const requestApprovalSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  /** The live release the sender saw, as for publish: published since, the request is a 409. */
  expectedPublishedReleaseId: idSchema.nullable(),
  /**
   * The sender's own waiting request they saw, to send again; null for a new one. Anything else
   * waiting, or that request answered meanwhile, is a 409, so nobody asks again for a page that
   * went live under them.
   */
  approvalId: idSchema.nullable(),
  note: z.string().trim().max(200, 'Ghi chú tối đa 200 ký tự'),
});
export type RequestApproval = z.infer<typeof requestApprovalSchema>;

export const rejectApprovalSchema = z.object({
  /** The request and the revision the approver saw: one sent again since is not refused. */
  approvalId: idSchema,
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1, 'Nhập lý do').max(500, 'Lý do tối đa 500 ký tự'),
});
export type RejectApproval = z.infer<typeof rejectApprovalSchema>;

export const approvalResponseSchema = z.object({ page: pageSummarySchema });
export type ApprovalResponse = z.infer<typeof approvalResponseSchema>;

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

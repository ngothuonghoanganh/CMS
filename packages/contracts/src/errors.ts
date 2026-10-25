import { z } from 'zod';

export const errorCodes = [
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'revision_conflict',
  'pointer_conflict',
  'slug_taken',
  'subdomain_taken',
  'email_taken',
  'invalid_credentials',
  'publish_blocked',
  'undo_not_available',
  'page_limit_reached',
  'site_limit_reached',
  'rate_limited',
  'payload_too_large',
  'unsupported_media_type',
  'origin_rejected',
  'internal',
] as const;
export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const problemIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string(),
  message: z.string(),
});
export type ProblemIssue = z.infer<typeof problemIssueSchema>;

/**
 * RFC 9457 problem details (`application/problem+json`) returned by every API error.
 * `context` carries machine-readable details, e.g. `{ currentRevision }` on a revision conflict
 * or `{ checks }` when publishing is blocked.
 */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: errorCodeSchema,
  detail: z.string().optional(),
  issues: z.array(problemIssueSchema).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
});
export type Problem = z.infer<typeof problemSchema>;

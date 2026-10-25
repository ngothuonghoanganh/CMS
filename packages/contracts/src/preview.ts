import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

export const PREVIEW_TTL_SECONDS = 7 * 24 * 60 * 60;

export const createPreviewLinkRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft') }),
  z.object({ kind: z.literal('release'), releaseId: idSchema }),
]);
export type CreatePreviewLinkRequest = z.infer<typeof createPreviewLinkRequestSchema>;

export const previewLinkResponseSchema = z.object({
  url: z.url(),
  expiresAt: isoDateTimeSchema,
});
export type PreviewLinkResponse = z.infer<typeof previewLinkResponseSchema>;

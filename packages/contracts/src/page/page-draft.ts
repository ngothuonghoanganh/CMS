import { z } from 'zod';

import { PageCompositionV1Schema } from '../composition/page-composition';

/** A new core page starts with an empty canonical Draft, without a PagePayload. */
export const CreateCanonicalPageRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).optional(),
    path: z.string().min(1).max(500).optional(),
    kind: z.enum(['standard', 'landing']).optional(),
  })
  .strict();
export type CreateCanonicalPageRequest = z.infer<typeof CreateCanonicalPageRequestSchema>;

export const SavePageDraftRequestSchema = z
  .object({
    expectedVersionNumber: z.number().int().positive(),
    composition: PageCompositionV1Schema,
  })
  .strict();
export type SavePageDraftRequest = z.infer<typeof SavePageDraftRequestSchema>;

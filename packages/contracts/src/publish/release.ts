import { z } from 'zod';

import {
  PageCompositionV1Schema,
  type PageCompositionV1,
} from '../composition/page-composition';

const releaseEntityIdSchema = z.string().uuid();
const releaseTimestampSchema = z.string().datetime({ offset: true });

/** Editable/current authoring state. A Draft is never a public renderer input. */
export const DraftSchema = z
  .object({
    id: releaseEntityIdSchema,
    workspaceId: releaseEntityIdSchema,
    siteId: releaseEntityIdSchema,
    pageId: releaseEntityIdSchema,
    versionNumber: z.number().int().positive(),
    composition: PageCompositionV1Schema,
    createdAt: releaseTimestampSchema,
    updatedAt: releaseTimestampSchema,
  })
  .strict();
export type Draft = z.infer<typeof DraftSchema>;

/**
 * Immutable published snapshot. The schema intentionally contains no mutable
 * draft pointer or editor projection; publishing changes the Page's pointer to
 * a Release record instead of mutating this object.
 */
export const ReleaseSchema = z
  .object({
    id: releaseEntityIdSchema,
    workspaceId: releaseEntityIdSchema,
    siteId: releaseEntityIdSchema,
    pageId: releaseEntityIdSchema,
    releaseNumber: z.number().int().positive(),
    sourceDraftId: releaseEntityIdSchema.optional(),
    composition: PageCompositionV1Schema,
    publishedAt: releaseTimestampSchema,
    createdAt: releaseTimestampSchema,
  })
  .strict();
export type Release = z.infer<typeof ReleaseSchema>;

export type ReleaseSnapshotInput = Omit<Release, 'composition'> & {
  composition: PageCompositionV1;
};

/** Parse a release at the immutable boundary without introducing a second model. */
export function parseRelease(input: unknown): Release {
  return ReleaseSchema.parse(input);
}

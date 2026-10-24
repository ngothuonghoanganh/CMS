import { type Composition, type PageGoal, pageGoalIds, type Seo } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const PAGE_MODEL = 'Page';
export const PAGES_DRAFT_SLUG_INDEX = 'pages_draft_slug_unique';
export const PAGES_PUBLISHED_SLUG_INDEX = 'pages_published_slug_unique';

/** The editable state of a page. Saving it never changes what is live (business rule 1). */
export interface PageDraftRecord {
  slug: string;
  /** Validated by the contract schema and `validateComposition` before it reaches the repository. */
  composition: Composition;
  seo: Seo;
  /** Incremented by every save; optimistic concurrency guard for autosave and publish. */
  revision: number;
  updatedAt: Date;
  updatedBy: Types.ObjectId;
}

export interface PageRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  title: string;
  goal: PageGoal | null;
  draft: PageDraftRecord;
  /** The live pointer. Written only by `movePointer` (ADR-005/006). */
  publishedReleaseId: Types.ObjectId | null;
  /** Projection of the pointer: the slug of the live release. Written only by `movePointer`. */
  publishedSlug: string | null;
  /** Number of releases created; the next release gets `releaseSeq + 1`. */
  releaseSeq: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * "" (the home page) is a valid slug, which Mongoose's built-in `required: true` would reject, so
 * the slug is only required to be present (any string, including "").
 */
function slugMissing(this: PageRecord): boolean {
  return typeof this.draft.slug !== 'string';
}

export const pageSchema = new Schema<PageRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    goal: { type: String, enum: [...pageGoalIds, null], default: null },
    draft: {
      slug: { type: String, required: slugMissing },
      composition: { type: Schema.Types.Mixed, required: true },
      seo: { type: Schema.Types.Mixed, required: true },
      revision: { type: Number, required: true, min: 0 },
      updatedAt: { type: Date, required: true },
      updatedBy: { type: Schema.Types.ObjectId, required: true },
    },
    publishedReleaseId: { type: Schema.Types.ObjectId, default: null },
    publishedSlug: { type: String, default: null },
    releaseSeq: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  // `minimize: false` keeps empty objects inside compositions exactly as they were saved.
  { collection: 'pages', versionKey: false, minimize: false },
);
pageSchema.index({ siteId: 1, 'draft.slug': 1 }, { unique: true, name: PAGES_DRAFT_SLUG_INDEX });
pageSchema.index(
  { siteId: 1, publishedSlug: 1 },
  {
    unique: true,
    name: PAGES_PUBLISHED_SLUG_INDEX,
    partialFilterExpression: { publishedSlug: { $type: 'string' } },
  },
);
pageSchema.index({ workspaceId: 1, siteId: 1, updatedAt: -1, _id: -1 });

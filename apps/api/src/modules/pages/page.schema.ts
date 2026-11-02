import {
  type Composition,
  type PageGoal,
  pageGoalIds,
  type Seo,
  type TemplateSource,
  templateSources,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const PAGE_MODEL = 'Page';
export const PAGES_DRAFT_SLUG_INDEX = 'pages_draft_slug_unique';
export const PAGES_PUBLISHED_SLUG_INDEX = 'pages_published_slug_unique';
export const PAGES_SITE_LIVE_INDEX = 'pages_site_live';
export const PAGES_CREATED_FROM_INDEX = 'pages_created_from_template';

/**
 * The template a page was made from, at the version it used (ADR-030): the count "Đã dùng N
 * trang" of board 18. Set once at creation; the page never follows later versions.
 */
export interface PageCreatedFromRecord {
  kind: 'template';
  source: TemplateSource;
  /** A system template's id, or (from G2) a workspace template's id as hex. */
  templateId: string;
  version: number;
}

/** The editable state of a page. Saving it never changes what is live (business rule 1). */
export interface PageDraftRecord {
  slug: string;
  /** As the contract schema and `parseComposition` returned it; never the raw request body. */
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
  /**
   * When a request to publish was last stored for the page (ADR-023). Written in that
   * transaction, guarded by the draft revision and the pointer, so a publish or a save at the
   * same moment conflicts with it.
   */
  approvalAskedAt?: Date | null;
  /** Null for a blank page or a page built for a goal; pages made before ADR-030 lack it. */
  createdFrom?: PageCreatedFromRecord | null;
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

const pageSchema = new Schema<PageRecord>(
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
    approvalAskedAt: { type: Date, default: null },
    createdFrom: {
      type: new Schema<PageCreatedFromRecord>(
        {
          kind: { type: String, enum: ['template'], required: true },
          source: { type: String, enum: templateSources, required: true },
          templateId: { type: String, required: true },
          version: { type: Number, required: true, min: 1 },
        },
        { _id: false },
      ),
      default: null,
    },
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
// The page counts of the Sites screen (ADR-028), which every admin screen loads with the site
// switcher: the index answers them alone, without reading pages and their compositions.
pageSchema.index(
  { workspaceId: 1, siteId: 1, publishedReleaseId: 1 },
  { name: PAGES_SITE_LIVE_INDEX },
);

// "Đã dùng N trang" of a template (ADR-030), counted on the index alone.
pageSchema.index(
  { workspaceId: 1, 'createdFrom.templateId': 1, 'createdFrom.source': 1, siteId: 1 },
  { name: PAGES_CREATED_FROM_INDEX },
);

/** In the workspace's own database (ADR-025). */
export const PAGE_COLLECTION = workspaceCollection(PAGE_MODEL, pageSchema);

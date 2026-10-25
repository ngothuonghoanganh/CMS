import {
  type ChangeItem,
  changeKinds,
  type Composition,
  type Seo,
  themePresetIds,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import type { SitePresentation } from './domain/site-presentation.js';

export const RELEASE_MODEL = 'Release';
export const RELEASES_VERSION_INDEX = 'releases_page_version_unique';
export const RELEASES_IDEMPOTENCY_INDEX = 'releases_page_idempotency_unique';

/**
 * A published snapshot of a page. Immutable (ADR-005): inserted once, then only read. Rollback and
 * undo move the page's pointer between releases and never edit one.
 */
export interface ReleaseRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId;
  version: number;
  slug: string;
  composition: Composition;
  seo: Seo;
  /**
   * The site settings the page is served with (ADR-015), read from the site inside the publish
   * transaction. Only releases published before ADR-015 lack it; `releasePresentation` reads
   * those as the current site.
   */
  sitePresentation?: SitePresentation;
  /** Draft revision the snapshot was taken from; the page is `live` while the draft keeps it. */
  sourceRevision: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  note: string;
  /** Changes from the release that was live before (or from an empty page). */
  changeSummary: ChangeItem[];
  checks: { warningsAcknowledged: string[] };
  idempotencyKey: string;
}

function slugMissing(this: ReleaseRecord): boolean {
  return typeof this.slug !== 'string';
}

const changeItemSchema = new Schema<ChangeItem>(
  {
    kind: { type: String, enum: changeKinds, required: true },
    label: { type: String, required: true },
    sectionId: { type: String, default: null },
  },
  { _id: false },
);

const sitePresentationSchema = new Schema<SitePresentation>(
  {
    name: { type: String, required: true },
    themePresetId: { type: String, enum: themePresetIds, required: true },
    logoAssetId: { type: String, default: null },
    defaultShareImageAssetId: { type: String, default: null },
  },
  { _id: false },
);

export const releaseSchema = new Schema<ReleaseRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1 },
    // "" (the home page) is valid, so the slug only has to be present.
    slug: { type: String, required: slugMissing },
    composition: { type: Schema.Types.Mixed, required: true },
    seo: { type: Schema.Types.Mixed, required: true },
    // Required for every new release; documents published before ADR-015 are read without it.
    sitePresentation: { type: sitePresentationSchema, required: true },
    sourceRevision: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    note: { type: String, default: '' },
    changeSummary: { type: [changeItemSchema], default: [] },
    checks: { warningsAcknowledged: { type: [String], default: [] } },
    idempotencyKey: { type: String, required: true },
  },
  { collection: 'releases', versionKey: false, minimize: false },
);
releaseSchema.index({ pageId: 1, version: 1 }, { unique: true, name: RELEASES_VERSION_INDEX });
releaseSchema.index(
  { pageId: 1, idempotencyKey: 1 },
  { unique: true, name: RELEASES_IDEMPOTENCY_INDEX },
);
// History: releases of a page, newest first.
releaseSchema.index({ pageId: 1, createdAt: -1, _id: -1 });

// Defence in depth for immutability: no query may update, replace or delete a release.
releaseSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndReplace',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function () {
    throw new Error('Releases are immutable (ADR-005)');
  },
);

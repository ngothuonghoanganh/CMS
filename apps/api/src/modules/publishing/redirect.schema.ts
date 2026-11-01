import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const REDIRECT_MODEL = 'Redirect';
const REDIRECTS_FROM_SLUG_INDEX = 'redirects_site_from_slug_unique';

/**
 * An old live slug of a page (ADR-006). It points to the page, not to a slug, and is resolved at
 * request time to the page's current live slug, so redirects never chain or loop.
 */
export interface RedirectRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  fromSlug: string;
  pageId: Types.ObjectId;
  createdAt: Date;
}

function fromSlugMissing(this: RedirectRecord): boolean {
  return typeof this.fromSlug !== 'string';
}

const redirectSchema = new Schema<RedirectRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    // "" (the old home page) is a valid source, so the slug only has to be present.
    fromSlug: { type: String, required: fromSlugMissing },
    pageId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'redirects', versionKey: false },
);
redirectSchema.index({ siteId: 1, fromSlug: 1 }, { unique: true, name: REDIRECTS_FROM_SLUG_INDEX });

/** In the workspace's own database (ADR-025). */
export const REDIRECT_COLLECTION = workspaceCollection(REDIRECT_MODEL, redirectSchema);

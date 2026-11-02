import { Schema, type Types } from 'mongoose';
import { isErasure } from '../../shared/persistence/erasure.js';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const CONSENT_VERSION_MODEL = 'ConsentVersion';
export const CONSENT_VERSIONS_SITE_VERSION_INDEX = 'consent_versions_site_version_unique';

/**
 * One version of a site's consent texts (ADR-017). Immutable: saving a new text inserts the next
 * version. Releases snapshot the version a form shows, and leads point to their release, so
 * changing a version would rewrite the evidence of what people agreed to (rule 10).
 */
export interface ConsentVersionRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  /** 1, 2, 3… per site, in the order they were saved. */
  version: number;
  /** May contain `CONTROLLER_NAME_PLACEHOLDER`, filled in when the text is shown. */
  requiredText: string;
  /** The separate, optional marketing checkbox; null when the form has none. */
  marketingText: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const consentVersionSchema = new Schema<ConsentVersionRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1 },
    requiredText: { type: String, required: true },
    marketingText: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'consent_versions', versionKey: false },
);
consentVersionSchema.index(
  { siteId: 1, version: 1 },
  { unique: true, name: CONSENT_VERSIONS_SITE_VERSION_INDEX },
);
// Version history of a site, newest first.
consentVersionSchema.index({ siteId: 1, createdAt: -1, _id: -1 });

// Defence in depth for immutability: no query may update or replace a version, and only the
// deletion of its site removes one (ADR-027).
consentVersionSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  function () {
    throw new Error('Consent versions are immutable (ADR-017)');
  },
);
consentVersionSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  if (!isErasure(this)) {
    throw new Error(
      'Consent versions are immutable (ADR-017): only deleting their site removes them',
    );
  }
});

/** In the workspace's own database (ADR-025). */
export const CONSENT_VERSION_COLLECTION = workspaceCollection(
  CONSENT_VERSION_MODEL,
  consentVersionSchema,
);

import { Schema, type Types } from 'mongoose';

export const CONSENT_VERSION_MODEL = 'ConsentVersion';
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

export const consentVersionSchema = new Schema<ConsentVersionRecord>(
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

// Defence in depth for immutability: no query may update, replace or delete a version.
consentVersionSchema.pre(
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
    throw new Error('Consent versions are immutable (ADR-017)');
  },
);

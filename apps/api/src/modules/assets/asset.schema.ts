import { type AssetMimeType, assetMimeTypes } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const ASSET_MODEL = 'Asset';

export interface AssetRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  storageKey: string;
  /** Detected from the bytes, never taken from the client. */
  mimeType: AssetMimeType;
  bytes: number;
  width: number;
  height: number;
  /** Default description, copied into an image field when the asset is picked; null if decorative. */
  alt: string | null;
  decorative: boolean;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}

/** ADR-005/ADR-012: an asset is either described (non-empty alt) or decorative (alt null). */
export function isDescribedXorDecorative(alt: string | null, decorative: boolean): boolean {
  return decorative ? alt === null : alt !== null && alt.trim().length > 0;
}

export const assetSchema = new Schema<AssetRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, enum: assetMimeTypes, required: true },
    bytes: { type: Number, required: true, min: 1 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    alt: { type: String, default: null },
    decorative: { type: Boolean, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'assets', versionKey: false },
);
assetSchema.index({ siteId: 1, createdAt: -1, _id: -1 });

// Model-level guard: runs on every insert and on `save()` of an edited document.
assetSchema.pre('validate', function () {
  if (!isDescribedXorDecorative(this.alt, this.decorative)) {
    this.invalidate('alt', 'An asset needs a non-empty alt or the decorative flag, not both');
  }
});

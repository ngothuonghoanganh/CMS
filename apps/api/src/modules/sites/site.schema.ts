import { type ThemePresetId, themePresetIds } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const SITE_MODEL = 'Site';
export const SITES_SUBDOMAIN_INDEX = 'sites_subdomain_unique';

export interface SiteRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  /** Lowercase, globally unique and immutable after creation (ADR-011). */
  subdomain: string;
  themePresetId: ThemePresetId;
  logoAssetId: Types.ObjectId | null;
  defaultShareImageAssetId: Types.ObjectId | null;
  /**
   * Pages created in the site so far. Every page creation increments it in its transaction, so
   * two concurrent creations in one site write the same document and MongoDB retries the later
   * one, which then counts the other's page against the limit (ADR-014).
   */
  pageSeq: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const siteSchema = new Schema<SiteRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    subdomain: { type: String, required: true, lowercase: true, immutable: true },
    themePresetId: { type: String, enum: themePresetIds, required: true },
    logoAssetId: { type: Schema.Types.ObjectId, default: null },
    defaultShareImageAssetId: { type: Schema.Types.ObjectId, default: null },
    pageSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'sites', versionKey: false },
);
siteSchema.index({ subdomain: 1 }, { unique: true, name: SITES_SUBDOMAIN_INDEX });
siteSchema.index({ workspaceId: 1, createdAt: 1 });

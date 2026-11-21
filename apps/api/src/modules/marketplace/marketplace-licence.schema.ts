import { type MarketplaceLicenceSource, marketplaceLicenceSources } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const MARKETPLACE_LICENCE_MODEL = 'MarketplaceLicence';

/** One licence per workspace and item: a second claim or purchase finds the first. */
export const MARKETPLACE_LICENCES_WORKSPACE_ITEM_INDEX = 'marketplace_licences_workspace_item';

/**
 * A workspace's licence of a marketplace item (ADR-036), in the master DB next to the invoices:
 * a purchase grants it in the transaction that records the invoice paid (MP3), and it is kept as
 * a payment record. It covers every site of the workspace and is never taken back.
 */
export interface MarketplaceLicenceRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  itemId: string;
  source: MarketplaceLicenceSource;
  /** The version new pages are made from: the one claimed or bought, then the one updated to. */
  version: number;
  /**
   * SHA-256 of that version's parsed composition (`versionHashOf`): the API does not start when
   * the catalog's content of the version is no longer what was granted.
   */
  versionHash: string;
  /** The paid invoice of a purchase; null for a free claim. */
  invoiceId: Types.ObjectId | null;
  /** The terms agreed to when it was claimed or bought. */
  termsVersion: number;
  grantedAt: Date;
  /** Who claimed it, or who bought it (the invoice's `createdBy`). */
  grantedBy: Types.ObjectId;
  updatedAt: Date;
  updatedBy: Types.ObjectId;
}

export const marketplaceLicenceSchema = new Schema<MarketplaceLicenceRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    itemId: { type: String, required: true },
    source: { type: String, enum: marketplaceLicenceSources, required: true },
    version: { type: Number, required: true },
    versionHash: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    termsVersion: { type: Number, required: true },
    grantedAt: { type: Date, required: true },
    grantedBy: { type: Schema.Types.ObjectId, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'marketplace_licences', versionKey: false },
);

marketplaceLicenceSchema.index(
  { workspaceId: 1, itemId: 1 },
  { unique: true, name: MARKETPLACE_LICENCES_WORKSPACE_ITEM_INDEX },
);
// "Được dùng nhiều": how many workspaces hold each item, counted on this index alone.
marketplaceLicenceSchema.index({ itemId: 1 });

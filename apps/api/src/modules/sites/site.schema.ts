import { type RetentionMonths, type ThemePresetId, themePresetIds } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const SITE_MODEL = 'Site';
export const SITES_SUBDOMAIN_INDEX = 'sites_subdomain_unique';

/** Personal data settings of the site, edited by the owner on "Dữ liệu & đồng ý" (ADR-017). */
export interface SitePrivacyRecord {
  /** The business that collects the data ("đơn vị thu thập dữ liệu"). */
  controllerName: string;
  /** Where people send requests about their data; optional. */
  requestEmail: string | null;
  policyUrl: string;
  /** Leads expire this many months after they arrive; null keeps them. */
  retentionMonths: RetentionMonths;
  updatedAt: Date;
  updatedBy: Types.ObjectId;
}

/**
 * An address the site's leads are emailed to (ADR-018). It receives nothing until its owner opens
 * the confirmation link; the database keeps only a hash of the link's secret.
 */
export interface LeadRecipientRecord {
  _id: Types.ObjectId;
  /** Lowercase. */
  email: string;
  addedAt: Date;
  /** When the last confirmation email went out; null when it could not be sent. */
  invitedAt: Date | null;
  confirmedAt: Date | null;
  /** sha256 (hex) of the current link's secret; null once confirmed. */
  tokenHash: string | null;
  tokenExpiresAt: Date | null;
}

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
  /**
   * Null until the owner saves the settings once. Sites created before ADR-017 lack the field;
   * read it through `sitePrivacyOf`.
   */
  privacy?: SitePrivacyRecord | null;
  /** At most `LEAD_RECIPIENTS_MAX`. Sites created before ADR-018 lack the field. */
  leadRecipients?: LeadRecipientRecord[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sitePrivacySchema = new Schema<SitePrivacyRecord>(
  {
    controllerName: { type: String, required: true },
    requestEmail: { type: String, default: null },
    policyUrl: { type: String, required: true },
    // Null (no automatic deletion) skips the enum check.
    retentionMonths: { type: Number, enum: [6, 12, 24], default: null },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

export function sitePrivacyOf(site: Pick<SiteRecord, 'privacy'>): SitePrivacyRecord | null {
  return site.privacy ?? null;
}

export function leadRecipientsOf(site: Pick<SiteRecord, 'leadRecipients'>): LeadRecipientRecord[] {
  return site.leadRecipients ?? [];
}

/** The addresses that receive the site's leads now. */
export function confirmedRecipientsOf(
  site: Pick<SiteRecord, 'leadRecipients'>,
): LeadRecipientRecord[] {
  return leadRecipientsOf(site).filter((recipient) => recipient.confirmedAt !== null);
}

const leadRecipientSchema = new Schema<LeadRecipientRecord>({
  email: { type: String, required: true },
  addedAt: { type: Date, required: true },
  invitedAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
  tokenHash: { type: String, default: null },
  tokenExpiresAt: { type: Date, default: null },
});

export const siteSchema = new Schema<SiteRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    subdomain: { type: String, required: true, lowercase: true, immutable: true },
    themePresetId: { type: String, enum: themePresetIds, required: true },
    logoAssetId: { type: Schema.Types.ObjectId, default: null },
    defaultShareImageAssetId: { type: Schema.Types.ObjectId, default: null },
    pageSeq: { type: Number, default: 0 },
    privacy: { type: sitePrivacySchema, default: null },
    leadRecipients: { type: [leadRecipientSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'sites', versionKey: false },
);
siteSchema.index({ subdomain: 1 }, { unique: true, name: SITES_SUBDOMAIN_INDEX });
siteSchema.index({ workspaceId: 1, createdAt: 1 });
// The confirmation link finds its address by the hash of its secret (ADR-018).
siteSchema.index({ 'leadRecipients.tokenHash': 1 }, { name: 'sites_recipient_token' });

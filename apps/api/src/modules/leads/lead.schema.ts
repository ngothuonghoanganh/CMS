import { Schema, type Types } from 'mongoose';
import type { LeadDevice, SpamReason } from './domain/lead-intake-rules.js';

export const LEAD_MODEL = 'Lead';
export const LEADS_SUBMISSION_INDEX = 'leads_site_submission_unique';

export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'unreachable' | 'won';

/**
 * A visitor's submission of a lead form (ADR-016). Personal data: never logged, never copied into
 * activity or analytics (rule 10). Removed by the TTL index at `expiresAt` (ADR-017).
 */
export interface LeadRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId;
  /** The release the visitor saw: its snapshot holds the consent text they agreed to. */
  releaseId: Types.ObjectId;
  releaseVersion: number;
  /** From the page script; a retry with the same id is the same lead. Null without script. */
  submissionId: string | null;
  fields: { name: string; phone: string; email: string | null; message: string | null };
  /** The required consent is implied: a lead only exists once it was given. */
  consent: { marketing: boolean; at: Date; marketingWithdrawnAt: Date | null };
  source: { source: string; medium: string; campaign: string | null };
  device: LeadDevice;
  status: LeadStatus;
  note: string;
  spam: { suspected: boolean; reasons: SpamReason[] };
  createdAt: Date;
  /** Null when the site keeps leads until they are deleted by hand. */
  expiresAt: Date | null;
}

export const leadSchema = new Schema<LeadRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, required: true },
    releaseId: { type: Schema.Types.ObjectId, required: true },
    releaseVersion: { type: Number, required: true, min: 1 },
    submissionId: { type: String, default: null },
    fields: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: null },
      message: { type: String, default: null },
    },
    consent: {
      marketing: { type: Boolean, required: true },
      at: { type: Date, required: true },
      marketingWithdrawnAt: { type: Date, default: null },
    },
    source: {
      source: { type: String, required: true },
      medium: { type: String, required: true },
      campaign: { type: String, default: null },
    },
    device: { type: String, enum: ['mobile', 'desktop'], required: true },
    status: {
      type: String,
      enum: ['new', 'contacted', 'scheduled', 'unreachable', 'won'],
      default: 'new',
    },
    note: { type: String, default: '' },
    spam: {
      suspected: { type: Boolean, required: true },
      reasons: { type: [String], enum: ['honeypot', 'too_fast'], default: [] },
    },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'leads', versionKey: false },
);
leadSchema.index(
  { siteId: 1, submissionId: 1 },
  {
    unique: true,
    name: LEADS_SUBMISSION_INDEX,
    partialFilterExpression: { submissionId: { $type: 'string' } },
  },
);
leadSchema.index({ siteId: 1, createdAt: -1, _id: -1 });
// Leads without an expiry (null) are kept: the TTL monitor skips them.
leadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LEAD_LIMIT_MODEL = 'LeadLimit';
export const LEAD_LIMITS_KEY_INDEX = 'lead_limits_key_unique';

/** A rate-limit window (ADR-016): requests counted per key until `expiresAt`. */
export interface LeadLimitRecord {
  _id: Types.ObjectId;
  /** `clientLimitKey` or `siteLimitKey`; addresses are hashed. */
  key: string;
  count: number;
  expiresAt: Date;
}

export const leadLimitSchema = new Schema<LeadLimitRecord>(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'lead_limits', versionKey: false },
);
leadLimitSchema.index({ key: 1 }, { unique: true, name: LEAD_LIMITS_KEY_INDEX });
leadLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

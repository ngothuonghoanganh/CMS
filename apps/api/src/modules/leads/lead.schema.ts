import {
  type LeadDevice,
  leadDevices,
  type LeadNotificationErrorCode,
  leadNotificationErrorCodes,
  type LeadNotificationStatus,
  leadNotificationStatuses,
  type LeadStatus,
  leadStatuses,
  type SpamReason,
  spamReasons,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import type { LeadSearchKeys } from './domain/lead-search.js';

export const LEAD_MODEL = 'Lead';
export const LEADS_SUBMISSION_INDEX = 'leads_site_submission_unique';

/** The email notification of a lead (ADR-018). */
export interface LeadNotificationRecord {
  status: LeadNotificationStatus;
  /** Attempts made so far; while `sending`, the running one included. */
  attempts: number;
  lastErrorCode: LeadNotificationErrorCode | null;
  sentAt: Date | null;
  /** How many confirmed addresses the SMTP server accepted the email for. */
  recipients: number | null;
  /** Addresses refused one by one while the others were accepted. */
  rejectedRecipients?: number | null;
  /** Last change; a `sending` this old means its sender stopped (the startup sweep). */
  updatedAt: Date;
}

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
  /**
   * Normalized phone, email and name for the inbox search and for finding a person's leads
   * (ADR-018). Written on insert; leads stored before B3 have none and are not found by search.
   */
  search: LeadSearchKeys;
  /** Leads stored before ADR-018's notifications have none. */
  notification?: LeadNotificationRecord;
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
    device: { type: String, enum: leadDevices, required: true },
    status: { type: String, enum: leadStatuses, default: 'new' },
    note: { type: String, default: '' },
    spam: {
      suspected: { type: Boolean, required: true },
      reasons: { type: [String], enum: spamReasons, default: [] },
    },
    search: {
      phone: { type: String, required: true },
      email: { type: String, default: null },
      name: { type: String, required: true },
    },
    notification: {
      status: { type: String, enum: leadNotificationStatuses, required: true },
      attempts: { type: Number, required: true, min: 0 },
      lastErrorCode: { type: String, enum: [...leadNotificationErrorCodes, null], default: null },
      sentAt: { type: Date, default: null },
      recipients: { type: Number, default: null },
      rejectedRecipients: { type: Number, default: null },
      updatedAt: { type: Date, required: true },
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
// The inbox (ADR-018): each folder newest first, also narrowed to a page or a status (the status
// one also counts "N mới"). Every query starts inside one site.
leadSchema.index(
  { siteId: 1, 'spam.suspected': 1, createdAt: -1, _id: -1 },
  { name: 'leads_inbox' },
);
leadSchema.index(
  { siteId: 1, pageId: 1, 'spam.suspected': 1, createdAt: -1, _id: -1 },
  { name: 'leads_inbox_page' },
);
leadSchema.index(
  { siteId: 1, status: 1, 'spam.suspected': 1, createdAt: -1, _id: -1 },
  { name: 'leads_inbox_status' },
);
// Search by the start of a phone number or an email, and a person's leads (ADR-017).
leadSchema.index({ siteId: 1, 'search.phone': 1 }, { name: 'leads_search_phone' });
leadSchema.index({ siteId: 1, 'search.email': 1 }, { name: 'leads_search_email' });
// The startup sweep of unsent notifications looks across every site (ADR-018), the one index
// that does not start with `siteId`.
leadSchema.index(
  { 'notification.status': 1, 'notification.updatedAt': 1 },
  { name: 'leads_notification_sweep' },
);
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

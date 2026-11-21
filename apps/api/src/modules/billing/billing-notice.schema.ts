import { Schema, type Types } from 'mongoose';

export const BILLING_NOTICE_MODEL = 'BillingNotice';

/** How long a notice is remembered: longer than any period, so none is sent twice. */
export const BILLING_NOTICE_RETENTION_DAYS = 400;

/**
 * An email of the plan sent to the Chủ sở hữu (ADR-035, T3), in the master DB: `_id` is the
 * email's idempotency key, so each email (a trial's reminder, a refused charge, a receipt…) goes
 * once, whichever instance or retry sends it. No data of the email itself, no address.
 */
export interface BillingNoticeRecord {
  _id: string;
  workspaceId: Types.ObjectId;
  template: string;
  sentAt: Date;
  expiresAt: Date;
}

export const billingNoticeSchema = new Schema<BillingNoticeRecord>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    template: { type: String, required: true },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'billing_notices', versionKey: false },
);
billingNoticeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

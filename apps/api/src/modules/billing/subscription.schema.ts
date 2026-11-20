import { type BillingCycle, billingCycles } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const SUBSCRIPTION_MODEL = 'Subscription';

/**
 * The subscription of a workspace (ADR-035), in the master DB: the gateway's events arrive before
 * anyone knows the workspace, and payment records outlive the workspace's data. It stores facts;
 * the state and the access level follow from them and the time (`subscriptionStatusOf`).
 */
export interface SubscriptionRecord {
  /** The workspace's id: one subscription per workspace. */
  _id: Types.ObjectId;
  planId: string;
  cycle: BillingCycle;
  trialEndsAt: Date | null;
  periodStart: Date;
  periodEnd: Date;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { planId: string; cycle: BillingCycle } | null;
  openInvoiceId: Types.ObjectId | null;
  failedSince: Date | null;
  /** The gateway's token and what the owner sees; never the card number. */
  paymentMethod: {
    token: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  billingInfo: { companyName: string; taxCode: string; address: string; email: string } | null;
  nextActionAt: Date | null;
  lockedUntil: Date | null;
  /** Goes up with every change; each write is guarded by the version it read. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const planChangeSchema = new Schema(
  {
    planId: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
  },
  { _id: false },
);

const paymentMethodSchema = new Schema(
  {
    token: { type: String, required: true },
    brand: { type: String, required: true },
    last4: { type: String, required: true },
    expMonth: { type: Number, required: true },
    expYear: { type: Number, required: true },
  },
  { _id: false },
);

const billingInfoSchema = new Schema(
  {
    companyName: { type: String, required: true },
    taxCode: { type: String, required: true },
    address: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

export const subscriptionSchema = new Schema<SubscriptionRecord>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    planId: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
    trialEndsAt: { type: Date, default: null },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, required: true },
    scheduledChange: { type: planChangeSchema, default: null },
    openInvoiceId: { type: Schema.Types.ObjectId, default: null },
    failedSince: { type: Date, default: null },
    paymentMethod: { type: paymentMethodSchema, default: null },
    billingInfo: { type: billingInfoSchema, default: null },
    nextActionAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    version: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  // Read by `_id` only in T1; the renewal job of T3 adds the index it queries by.
  { collection: 'subscriptions', versionKey: false },
);

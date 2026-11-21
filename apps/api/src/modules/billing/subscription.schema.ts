import {
  type BillingCycle,
  billingCycles,
  type RenewalMethod,
  renewalMethods,
} from '@plp/contracts';
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
  /**
   * The card came only after the trial had ended without one (T3): it is not charged for the
   * trial's end. Missing on subscriptions stored before T3, read as false.
   */
  cardAfterTrial?: boolean;
  /** How the next period is paid (T4). Missing on subscriptions stored before T4, read as card. */
  renewalMethod?: RenewalMethod;
  /**
   * The next period's invoice, made before the end for a bank transfer (T4). Missing before T4,
   * read as null.
   */
  renewalInvoiceId?: Types.ObjectId | null;
  /** The next period, paid before the current one ended (T4); missing before T4, read as null. */
  prepaid?: PrepaidPeriodRecord | null;
  billingInfo: { companyName: string; taxCode: string; address: string; email: string } | null;
  nextActionAt: Date | null;
  lockedUntil: Date | null;
  /** Goes up with every change; each write is guarded by the version it read. */
  version: number;
  /**
   * Goes up in a transaction that relies on what the plan allows until it commits (enabling an
   * automation): the write makes it conflict with a plan change at the same moment, so one of
   * the two runs again after the other. Not a fact of the subscription.
   */
  holdSeq?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A next period paid before the current one ended (T4): it starts at `periodStart`. */
export interface PrepaidPeriodRecord {
  invoiceId: Types.ObjectId;
  planId: string;
  cycle: BillingCycle;
  periodStart: Date;
  periodEnd: Date;
}

const prepaidSchema = new Schema<PrepaidPeriodRecord>(
  {
    invoiceId: { type: Schema.Types.ObjectId, required: true },
    planId: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
  },
  { _id: false },
);

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
    cardAfterTrial: { type: Boolean, default: false },
    renewalMethod: { type: String, enum: renewalMethods, default: 'card' },
    renewalInvoiceId: { type: Schema.Types.ObjectId, default: null },
    prepaid: { type: prepaidSchema, default: null },
    billingInfo: { type: billingInfoSchema, default: null },
    nextActionAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    version: { type: Number, required: true, min: 0 },
    holdSeq: { type: Number, default: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'subscriptions', versionKey: false },
);
// The billing job's queue (ADR-035, T3): the subscriptions due by a time, earliest first.
subscriptionSchema.index({ nextActionAt: 1 }, { name: 'subscriptions_next_action' });
// Held ones come due again when their hold runs out (an instance that stopped while working).
subscriptionSchema.index(
  { lockedUntil: 1 },
  { name: 'subscriptions_locked', partialFilterExpression: { lockedUntil: { $type: 'date' } } },
);

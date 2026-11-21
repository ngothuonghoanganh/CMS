import {
  type BillingCycle,
  billingCycles,
  type RenewalMethod,
  renewalMethods,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const BILLING_LOG_MODEL = 'BillingLogEntry';

/**
 * What happened to the subscription (ADR-035): a free change of the trial's plan, paying for a
 * plan now (which ends the trial), an upgrade paid for the days left, a new card, new billing
 * info; and from T3 a change scheduled for the period's end and its withdrawal, "Hủy gói" and
 * "Giữ lại gói", a period renewed (with the scheduled change it applied), a canceled plan paid
 * for again, and a transfer started; and a marketplace item bought (ADR-036); and from T4 the
 * renewal method changed, the next period paid before its start, and an early transfer invoice
 * voided by a plan change.
 */
export const billingLogActions = [
  'plan_changed',
  'paid_plan_started',
  'plan_upgraded',
  'payment_method_changed',
  'billing_info_changed',
  'change_scheduled',
  'scheduled_change_canceled',
  'scheduled_change_applied',
  'cancel_scheduled',
  'cancel_withdrawn',
  'period_renewed',
  'plan_restarted',
  'transfer_started',
  'marketplace_purchased',
  'renewal_method_changed',
  'renewal_prepaid',
  'renewal_invoice_voided',
] as const;
export type BillingLogAction = (typeof billingLogActions)[number];

export interface PlanChoice {
  planId: string;
  cycle: BillingCycle;
}

/**
 * One entry of `billing_log` in the master DB: who changed the subscription, when and how. Kept
 * with the payment records, so it outlives the workspace's data; never a card, a token or the
 * billing info itself.
 */
export interface BillingLogRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  at: Date;
  /** The member who did it; null for the subscription's own jobs (T3). */
  actorId: Types.ObjectId | null;
  action: BillingLogAction;
  from: PlanChoice | null;
  to: PlanChoice | null;
  /** The invoice that paid for a change, and its amount; null for the other actions. */
  invoiceId: Types.ObjectId | null;
  amount: number | null;
  /** The marketplace item bought (`marketplace_purchased`); null for the other actions. */
  itemId: string | null;
  /** The renewal method chosen (`renewal_method_changed`, T4); null for the other actions. */
  renewalMethod: RenewalMethod | null;
}

const planChoiceSchema = new Schema<PlanChoice>(
  {
    planId: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
  },
  { _id: false },
);

export const billingLogSchema = new Schema<BillingLogRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, enum: billingLogActions, required: true },
    from: { type: planChoiceSchema, default: null },
    to: { type: planChoiceSchema, default: null },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    amount: { type: Number, default: null },
    itemId: { type: String, default: null },
    renewalMethod: { type: String, enum: [...renewalMethods, null], default: null },
  },
  // Only written so far; whoever lists it adds the index of that list.
  { collection: 'billing_log', versionKey: false },
);

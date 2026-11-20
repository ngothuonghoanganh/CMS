import { type BillingCycle, billingCycles } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const BILLING_LOG_MODEL = 'BillingLogEntry';

/** What the owner did to the subscription (ADR-035); T2 and T3 add their actions. */
export const billingLogActions = ['plan_changed'] as const;
export type BillingLogAction = (typeof billingLogActions)[number];

export interface PlanChoice {
  planId: string;
  cycle: BillingCycle;
}

/**
 * One entry of `billing_log` in the master DB: who changed the subscription, when and how. Kept
 * with the payment records, so it outlives the workspace's data; never a card number or token.
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
  },
  // Written only in T1; whoever lists it adds the index of that list.
  { collection: 'billing_log', versionKey: false },
);

import { gatewayEventKinds, type GatewayEventKind, paymentProviders } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const BILLING_EVENT_MODEL = 'BillingEvent';
export const BILLING_EVENTS_UNIQUE_INDEX = 'billing_events_provider_event_unique';

/** A gateway's event is kept this long so that it is applied once even when it comes again. */
export const BILLING_EVENT_RETENTION_DAYS = 90;

/**
 * One gateway event the API applied (ADR-035), written in the transaction that applies it: an
 * event that arrives again meets its unique index and changes nothing. Only ids, no card data.
 */
export interface BillingEventRecord {
  _id: Types.ObjectId;
  provider: string;
  eventId: string;
  kind: GatewayEventKind;
  receivedAt: Date;
  expiresAt: Date;
}

export const billingEventSchema = new Schema<BillingEventRecord>(
  {
    provider: { type: String, enum: paymentProviders, required: true },
    eventId: { type: String, required: true },
    kind: { type: String, enum: gatewayEventKinds, required: true },
    receivedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'billing_events', versionKey: false },
);
billingEventSchema.index(
  { provider: 1, eventId: 1 },
  { unique: true, name: BILLING_EVENTS_UNIQUE_INDEX },
);
billingEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

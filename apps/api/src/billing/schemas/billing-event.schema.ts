import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type BillingEventDocument = HydratedDocument<BillingEventRecord>;

@Schema({
  collection: 'billingEvents',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class BillingEventRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: false, index: true })
  tenantId?: string;

  @Prop({ type: String, required: true, index: true })
  eventType!: 'subscription.created' | 'subscription.replaced';

  @Prop({ type: String, required: true, unique: true })
  idempotencyKey!: string;

  @Prop({ type: String, enum: ['manual', 'stripe'], required: true })
  provider!: 'manual' | 'stripe';

  @Prop({ type: Object, required: true, default: {} })
  metadata!: Record<string, string>;

  @Prop({ type: Date, required: true, immutable: true })
  occurredAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BillingEventSchema = SchemaFactory.createForClass(BillingEventRecord);
BillingEventSchema.index({ tenantId: 1, occurredAt: -1 });

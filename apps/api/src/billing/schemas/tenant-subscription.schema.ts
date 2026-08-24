import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantSubscriptionDocument = HydratedDocument<TenantSubscriptionRecord>;

@Schema({
  collection: 'tenantSubscriptions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class TenantSubscriptionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, immutable: true })
  tenantId!: string;

  @Prop({ type: String, required: true, index: true })
  planId!: string;

  @Prop({
    type: String,
    enum: ['trialing', 'active', 'past_due', 'canceled', 'suspended'],
    required: true,
  })
  status!: 'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended';

  @Prop({ type: Date, required: true })
  currentPeriodStart!: Date;

  @Prop({ type: Date, required: true })
  currentPeriodEnd!: Date;

  @Prop({ type: Boolean, required: true, default: false })
  cancelAtPeriodEnd!: boolean;

  @Prop({ type: String, enum: ['manual', 'stripe'], required: true, default: 'manual' })
  provider!: 'manual' | 'stripe';

  @Prop({ type: String, required: false })
  providerCustomerId?: string;

  @Prop({ type: String, required: false })
  providerSubscriptionId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantSubscriptionSchema = SchemaFactory.createForClass(
  TenantSubscriptionRecord,
);
TenantSubscriptionSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
TenantSubscriptionSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['trialing', 'active', 'past_due'] },
    },
  },
);

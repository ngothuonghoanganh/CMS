import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantUsageDocument = HydratedDocument<TenantUsageRecord>;

@Schema({ collection: 'tenantUsage', timestamps: true, versionKey: false })
export class TenantUsageRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  tenantId!: string;

  @Prop({
    type: String,
    enum: ['page_views_monthly', 'form_submissions_monthly'],
    required: true,
    immutable: true,
  })
  metric!: 'page_views_monthly' | 'form_submissions_monthly';

  @Prop({ type: Date, required: true, immutable: true })
  periodStart!: Date;

  @Prop({ type: Date, required: true, immutable: true })
  periodEnd!: Date;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  value!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantUsageSchema = SchemaFactory.createForClass(TenantUsageRecord);
TenantUsageSchema.index({ tenantId: 1, metric: 1, periodStart: 1 }, { unique: true });
TenantUsageSchema.index({ tenantId: 1, periodEnd: 1 });

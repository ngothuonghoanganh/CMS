import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import type { PlanEntitlements } from '@payload/contracts';

export type PlanDocument = HydratedDocument<PlanRecord>;

@Schema({ collection: 'plans', timestamps: true, versionKey: false, minimize: false })
export class PlanRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  key!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'archived'],
    required: true,
    default: 'active',
  })
  status!: 'active' | 'inactive' | 'archived';

  @Prop({ type: Object, required: true })
  entitlements!: PlanEntitlements;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlanSchema = SchemaFactory.createForClass(PlanRecord);
PlanSchema.index({ key: 1 }, { unique: true });
PlanSchema.index({ status: 1, key: 1 });

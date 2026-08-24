import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantMembershipDocument = HydratedDocument<TenantMembershipRecord>;

@Schema({ collection: 'tenantMemberships', timestamps: true, versionKey: false })
export class TenantMembershipRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  tenantId!: string;

  @Prop({ type: String, required: true, trim: true, index: true })
  userId!: string;

  @Prop({ type: String, enum: ['owner', 'admin', 'member'], required: true })
  role!: 'owner' | 'admin' | 'member';

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantMembershipSchema =
  SchemaFactory.createForClass(TenantMembershipRecord);
TenantMembershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
TenantMembershipSchema.index({ userId: 1, createdAt: 1 });

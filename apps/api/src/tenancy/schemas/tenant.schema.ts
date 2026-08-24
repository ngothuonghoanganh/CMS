import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantStatus =
  'provisioning' | 'active' | 'suspended' | 'failed' | 'archived';
export type TenantDocument = HydratedDocument<TenantRecord>;

@Schema({ collection: 'tenants', timestamps: true, versionKey: false })
export class TenantRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({
    type: String,
    enum: ['provisioning', 'active', 'suspended', 'failed', 'archived'],
    required: true,
    default: 'provisioning',
  })
  status!: TenantStatus;

  @Prop({ type: String, required: true })
  databaseKey!: string;

  @Prop({ type: String, required: true })
  databaseName!: string;

  @Prop({ type: String, required: true, default: 'primary' })
  clusterKey!: string;

  @Prop({ type: String, required: false })
  credentialReference?: string;

  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: String, required: false })
  provisioningError?: string;

  @Prop({ type: String, required: false, index: true })
  legacyDatabaseName?: string;

  @Prop({ type: String, required: false })
  ownerUserId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantSchema = SchemaFactory.createForClass(TenantRecord);
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ databaseKey: 1 }, { unique: true });
TenantSchema.index({ databaseName: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { CustomExtensionDefinition } from '@payload/contracts';

export type TenantExtensionStatus = 'enabled' | 'disabled' | 'misconfigured';
export type TenantExtensionDocument = HydratedDocument<TenantExtensionRecord>;

@Schema({
  collection: 'tenantExtensions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class TenantExtensionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  extensionId!: string;

  @Prop({ type: Boolean, required: true, default: false })
  enabled!: boolean;

  @Prop({ type: String, required: false })
  installedVersion?: string;

  @Prop({
    type: String,
    enum: ['enabled', 'disabled', 'misconfigured'],
    required: true,
    default: 'disabled',
  })
  status!: TenantExtensionStatus;

  @Prop({ type: Object, required: true, default: {} })
  configuration!: Record<string, string | boolean | number>;

  @Prop({ type: Object, required: false })
  definition?: CustomExtensionDefinition;

  @Prop({ type: [String], required: true, default: [] })
  connectionIds!: string[];

  @Prop({ type: String, required: false, maxlength: 500 })
  lastError?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantExtensionSchema = SchemaFactory.createForClass(TenantExtensionRecord);
TenantExtensionSchema.index({ extensionId: 1 }, { unique: true });
TenantExtensionSchema.index({ enabled: 1, status: 1 });

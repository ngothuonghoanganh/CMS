import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PlatformAuditLogDocument = HydratedDocument<PlatformAuditLogRecord>;

@Schema({
  collection: 'platformAuditLogs',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class PlatformAuditLogRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, enum: ['platform_user', 'system'], required: true })
  actorType!: 'platform_user' | 'system';

  @Prop({ type: String, required: true })
  actorId!: string;

  @Prop({ type: String, required: true, index: true })
  action!: string;

  @Prop({ type: String, required: true, index: true })
  resourceType!: string;

  @Prop({ type: String, required: false })
  resourceId?: string;

  @Prop({ type: String, enum: ['success', 'failure', 'denied'], required: true })
  result!: 'success' | 'failure' | 'denied';

  @Prop({ type: String, required: false, index: true })
  requestId?: string;

  @Prop({ type: Object, required: false })
  metadata?: Record<string, unknown>;

  @Prop({ type: String, required: false })
  ipAddress?: string;

  @Prop({ type: String, required: false, maxlength: 500 })
  userAgent?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlatformAuditLogSchema =
  SchemaFactory.createForClass(PlatformAuditLogRecord);
PlatformAuditLogSchema.index({ createdAt: -1, _id: -1 });
PlatformAuditLogSchema.index({ action: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLogRecord>;

@Schema({ collection: 'auditLogs', timestamps: true, versionKey: false, minimize: false })
export class AuditLogRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, enum: ['user', 'system', 'platform_user'], required: true })
  actorType!: 'user' | 'system' | 'platform_user';

  @Prop({ type: String, required: true, trim: true })
  actorId!: string;

  @Prop({ type: String, required: true, trim: true, index: true })
  action!: string;

  @Prop({ type: String, required: false, index: true })
  workspaceId?: string;

  @Prop({ type: String, required: true, trim: true, index: true })
  resourceType!: string;

  @Prop({ type: String, required: false, trim: true })
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

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogRecord);
AuditLogSchema.index({ createdAt: -1, _id: -1 });
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type IntegrationDocument = HydratedDocument<IntegrationRecord>;

@Schema({
  collection: 'integrations',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class IntegrationRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, enum: ['email', 'webhook'] })
  type!: 'email' | 'webhook';

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: Boolean, required: true, default: true })
  enabled!: boolean;

  @Prop({ type: Object, required: true })
  config!: Record<string, unknown>;

  // Encrypted with the application integration key. This field is never part
  // of a response contract and is only read by the adapter boundary.
  @Prop({ type: String, required: false, select: false })
  secretCiphertext?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const IntegrationSchema = SchemaFactory.createForClass(IntegrationRecord);
IntegrationSchema.index({ workspaceId: 1, createdAt: -1 });
IntegrationSchema.index({ workspaceId: 1, type: 1, enabled: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type ExtensionConnectionDocument = HydratedDocument<ExtensionConnectionRecord>;

@Schema({
  collection: 'extensionConnections',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class ExtensionConnectionRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  extensionId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: String,
    enum: ['connected', 'disconnected', 'error', 'disabled'],
    required: true,
    default: 'disconnected',
  })
  status!: 'connected' | 'disconnected' | 'error' | 'disabled';

  @Prop({ type: Object, required: true, default: {} })
  configuration!: Record<string, string | boolean | number>;

  // The credential is tenant-scoped and never selected for API responses.
  @Prop({ type: String, required: false, select: false })
  secretCiphertext?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ExtensionConnectionSchema = SchemaFactory.createForClass(
  ExtensionConnectionRecord,
);
ExtensionConnectionSchema.index({ extensionId: 1, name: 1 }, { unique: true });
ExtensionConnectionSchema.index({ extensionId: 1, status: 1 });

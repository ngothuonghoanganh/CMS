import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PageExtensionInstanceDocument = HydratedDocument<PageExtensionInstanceRecord>;

@Schema({
  collection: 'pageExtensionInstances',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class PageExtensionInstanceRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  pageId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  extensionId!: string;

  @Prop({ type: String, required: false })
  connectionId?: string;

  @Prop({ type: Boolean, required: true, default: true })
  enabled!: boolean;

  @Prop({ type: Object, required: true, default: {} })
  configuration!: Record<string, string | boolean | number>;

  @Prop({ type: [String], required: true, default: [] })
  capabilities!: string[];

  @Prop({ type: [String], required: true, default: [] })
  runtimeIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const PageExtensionInstanceSchema = SchemaFactory.createForClass(
  PageExtensionInstanceRecord,
);
PageExtensionInstanceSchema.index({ pageId: 1, extensionId: 1 }, { unique: true });
PageExtensionInstanceSchema.index({ workspaceId: 1, pageId: 1, enabled: 1 });

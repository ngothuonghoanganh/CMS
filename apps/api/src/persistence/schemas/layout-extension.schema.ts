import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { SiteGlobalPayloadV1Schema } from '@payload/contracts';

export type LayoutExtensionDocument = HydratedDocument<LayoutExtensionRecord>;
export type LayoutExtensionVersionDocument =
  HydratedDocument<LayoutExtensionVersionRecord>;

/**
 * A Header or Footer layout extension resource. It owns its own draft and
 * published version pointers and shares the Page Builder engine. Pages attach
 * the resource explicitly; it is never auto-rendered by the renderer.
 */
@Schema({
  collection: 'layoutExtensions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class LayoutExtensionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: String, required: true, enum: ['header', 'footer'] })
  kind!: 'header' | 'footer';

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, required: false })
  draftVersionId?: string;

  @Prop({ type: String, required: false })
  publishedVersionId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const LayoutExtensionSchema = SchemaFactory.createForClass(LayoutExtensionRecord);
LayoutExtensionSchema.index({ workspaceId: 1, siteId: 1, kind: 1 });
LayoutExtensionSchema.index({ workspaceId: 1, siteId: 1, updatedAt: -1 });

@Schema({
  collection: 'layoutExtensionVersions',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  minimize: false,
})
export class LayoutExtensionVersionRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  resourceId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  versionNumber!: number;

  @Prop({
    type: Object,
    required: true,
    immutable: true,
    validate: {
      validator: (value: unknown) => SiteGlobalPayloadV1Schema.safeParse(value).success,
      message: 'document must be a valid site-header or site-footer document',
    },
  })
  document!: unknown;

  @Prop({ type: String, required: true, enum: ['draft', 'published', 'archived'] })
  status!: 'draft' | 'published' | 'archived';

  @Prop({ type: String, required: false })
  createdBy?: string;

  createdAt!: Date;
}

export const LayoutExtensionVersionSchema = SchemaFactory.createForClass(
  LayoutExtensionVersionRecord,
);
LayoutExtensionVersionSchema.index({ resourceId: 1, versionNumber: 1 }, { unique: true });
LayoutExtensionVersionSchema.index({ resourceId: 1, createdAt: -1 });

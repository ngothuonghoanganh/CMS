import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PageDocument = HydratedDocument<PageRecord>;

// The Mongo collection intentionally remains `landingPages`. Renaming the
// collection would be a destructive migration for existing workspaces.
@Schema({ collection: 'landingPages', timestamps: true, versionKey: false })
export class PageRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, required: false, trim: true, index: true })
  path?: string;

  @Prop({
    type: String,
    required: true,
    enum: ['standard', 'landing', 'system', 'collection-template'],
    default: 'standard',
  })
  kind!: 'standard' | 'landing' | 'system' | 'collection-template';

  @Prop({ type: String, required: false, enum: ['draft', 'published', 'archived'] })
  status?: 'draft' | 'published' | 'archived';

  @Prop({ type: String, required: false, index: true })
  parentId?: string;

  @Prop({ type: [String], required: false, default: undefined })
  anchors?: string[];

  // `slug` remains a compatibility field for legacy page URLs and clients.
  @Prop({
    type: String,
    required: false,
    trim: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  })
  slug?: string;

  @Prop({ type: String, required: false })
  currentDraftVersionId?: string;

  @Prop({ type: String, required: false })
  publishedVersionId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PageSchema = SchemaFactory.createForClass(PageRecord);
PageSchema.index({ siteId: 1, createdAt: -1 });
PageSchema.index({ siteId: 1, path: 1, publishedVersionId: 1 });
PageSchema.index({ siteId: 1, slug: 1, publishedVersionId: 1 });
PageSchema.index(
  { siteId: 1, path: 1 },
  { unique: true, partialFilterExpression: { path: { $type: 'string' } } },
);
PageSchema.index(
  { siteId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);

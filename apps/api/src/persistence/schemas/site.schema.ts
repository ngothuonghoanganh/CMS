import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type SiteDocument = HydratedDocument<SiteRecord>;

@Schema({
  collection: 'sites',
  timestamps: true,
  versionKey: false,
  // Global documents contain required empty props objects for structural
  // nodes. Keep those objects intact when Mongoose casts/saves the site.
  minimize: false,
})
export class SiteRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  })
  slug!: string;

  // Optional at persistence level so old tenant databases can be repaired by
  // SiteService without a destructive collection rewrite.
  @Prop({ type: String, required: false, index: true })
  homePageId?: string;

  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  })
  status!: 'draft' | 'published' | 'archived';

  @Prop({ type: String, required: false })
  primaryNavigationId?: string;

  @Prop({ type: String, required: false })
  footerNavigationId?: string;

  @Prop({ type: String, required: false })
  logo?: string;

  /** Versioned builder-owned global documents. Published globals are a snapshot. */
  @Prop({ type: Object, required: false, minimize: false })
  globalsDraft?: Record<string, unknown>;

  @Prop({ type: Object, required: false, minimize: false })
  publishedGlobals?: Record<string, unknown>;

  @Prop({ type: Object, required: false, minimize: false })
  designSystemDraft?: Record<string, unknown>;

  @Prop({ type: Object, required: false, minimize: false })
  publishedDesignSystem?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SiteSchema = SchemaFactory.createForClass(SiteRecord);
SiteSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

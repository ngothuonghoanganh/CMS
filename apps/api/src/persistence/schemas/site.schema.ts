import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type SiteDocument = HydratedDocument<SiteRecord>;

@Schema({ collection: 'sites', timestamps: true, versionKey: false })
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

  createdAt!: Date;
  updatedAt!: Date;
}

export const SiteSchema = SchemaFactory.createForClass(SiteRecord);
SiteSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

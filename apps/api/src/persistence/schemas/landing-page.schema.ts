import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type LandingPageDocument = HydratedDocument<LandingPageRecord>;

@Schema({ collection: 'landingPages', timestamps: true, versionKey: false })
export class LandingPageRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

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

export const LandingPageSchema = SchemaFactory.createForClass(LandingPageRecord);
LandingPageSchema.index({ siteId: 1, createdAt: -1 });
LandingPageSchema.index({ siteId: 1, slug: 1, publishedVersionId: 1 });
LandingPageSchema.index(
  { siteId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);

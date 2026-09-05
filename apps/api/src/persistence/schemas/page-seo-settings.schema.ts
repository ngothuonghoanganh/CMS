import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PageSeoSettingsDocument = HydratedDocument<PageSeoSettingsRecord>;

@Schema({ collection: 'pageSeoSettings', timestamps: true, versionKey: false })
export class PageSeoSettingsRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  landingPageId!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 200 })
  title?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 2_048 })
  canonicalUrl?: string;

  @Prop({ type: Boolean, required: true, default: false })
  noIndex!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  noFollow!: boolean;

  @Prop({ type: String, required: false, trim: true, maxlength: 200 })
  ogTitle?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  ogDescription?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 2_048 })
  ogImage?: string;

  @Prop({ type: String, required: false, enum: ['summary', 'summary_large_image'] })
  twitterCard?: 'summary' | 'summary_large_image';

  @Prop({ type: String, required: false, trim: true, maxlength: 200 })
  twitterTitle?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  twitterDescription?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 2_048 })
  twitterImage?: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 2_048 })
  favicon?: string;

  @Prop({ type: Object, required: false, minimize: false })
  bindings?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PageSeoSettingsSchema = SchemaFactory.createForClass(PageSeoSettingsRecord);
PageSeoSettingsSchema.index({ workspaceId: 1, landingPageId: 1 }, { unique: true });

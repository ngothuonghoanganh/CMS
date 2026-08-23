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

  createdAt!: Date;
  updatedAt!: Date;
}

export const SiteSchema = SchemaFactory.createForClass(SiteRecord);
SiteSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

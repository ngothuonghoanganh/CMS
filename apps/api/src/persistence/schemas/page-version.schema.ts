import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  PageCompositionSchema,
  PagePayloadSchema,
  PublishedPageBundleSchema,
} from '@payload/contracts';

export type PageVersionDocument = HydratedDocument<PageVersionRecord>;

@Schema({
  collection: 'pageVersions',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  minimize: false,
})
export class PageVersionRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  siteId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  landingPageId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  versionNumber!: number;

  @Prop({
    type: Object,
    required: true,
    immutable: true,
    validate: {
      validator: (value: unknown) => PagePayloadSchema.safeParse(value).success,
      message: 'payload must be a valid PagePayload',
    },
  })
  payload!: unknown;

  @Prop({
    type: Object,
    required: false,
    immutable: true,
    validate: {
      validator: (value: unknown) => PageCompositionSchema.safeParse(value).success,
      message: 'composition must be a valid PageComposition',
    },
  })
  composition?: unknown;

  @Prop({
    type: Object,
    required: false,
    validate: {
      validator: (value: unknown) => PublishedPageBundleSchema.safeParse(value).success,
      message: 'publishedBundle must be a valid published page bundle',
    },
  })
  publishedBundle?: unknown;

  createdAt!: Date;
}

export const PageVersionSchema = SchemaFactory.createForClass(PageVersionRecord);
PageVersionSchema.index({ landingPageId: 1, versionNumber: 1 }, { unique: true });
PageVersionSchema.index({ landingPageId: 1, createdAt: -1 });

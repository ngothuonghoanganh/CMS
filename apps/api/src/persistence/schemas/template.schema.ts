import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  PageLayoutAttachmentsSchema,
  PagePayloadSchema,
  TemplateCompositionSchema,
} from '@payload/contracts';

export type TemplateDocument = HydratedDocument<TemplateRecord>;
export type TemplateVersionDocument = HydratedDocument<TemplateVersionRecord>;

@Schema({ collection: 'templates', timestamps: true, versionKey: false, minimize: false })
export class TemplateRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: false, index: true })
  siteId?: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, required: true })
  latestVersionId!: string;

  @Prop({ type: String, required: false })
  publishedVersionId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(TemplateRecord);
TemplateSchema.index({ workspaceId: 1, createdAt: -1 });

@Schema({
  collection: 'templateVersions',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  minimize: false,
})
export class TemplateVersionRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  templateId!: string;

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
    type: [Object],
    required: false,
    default: undefined,
    validate: {
      validator: (value: unknown) => PageLayoutAttachmentsSchema.safeParse(value).success,
      message: 'layoutAttachments must be valid page layout attachments',
    },
  })
  layoutAttachments?: unknown[];

  @Prop({
    type: Object,
    required: false,
    immutable: true,
    validate: {
      validator: (value: unknown) => TemplateCompositionSchema.safeParse(value).success,
      message: 'composition must be valid template composition',
    },
  })
  composition?: unknown;

  @Prop({ type: String, required: false })
  createdBy?: string;

  createdAt!: Date;
}

export const TemplateVersionSchema = SchemaFactory.createForClass(TemplateVersionRecord);
TemplateVersionSchema.index({ templateId: 1, versionNumber: 1 }, { unique: true });
TemplateVersionSchema.index({ templateId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { PagePayloadSchema } from '@payload/contracts';

export type TemplateDocument = HydratedDocument<TemplateRecord>;

@Schema({ collection: 'templates', timestamps: true, versionKey: false, minimize: false })
export class TemplateRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({
    type: Object,
    required: true,
    validate: {
      validator: (value: unknown) => PagePayloadSchema.safeParse(value).success,
      message: 'payload must be a valid PagePayload',
    },
  })
  payload!: unknown;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(TemplateRecord);
TemplateSchema.index({ workspaceId: 1, createdAt: -1 });

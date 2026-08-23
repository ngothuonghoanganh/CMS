import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type FormIntegrationBindingDocument =
  HydratedDocument<FormIntegrationBindingRecord>;

@Schema({ collection: 'formIntegrationBindings', timestamps: true, versionKey: false })
export class FormIntegrationBindingRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  landingPageId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  formNodeId!: string;

  @Prop({ type: [String], required: true, default: [] })
  integrationIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const FormIntegrationBindingSchema = SchemaFactory.createForClass(
  FormIntegrationBindingRecord,
);
FormIntegrationBindingSchema.index(
  { workspaceId: 1, landingPageId: 1, formNodeId: 1 },
  { unique: true },
);

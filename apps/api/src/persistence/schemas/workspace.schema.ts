import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { SiteDesignSystemSchema } from '@payload/contracts';

export type WorkspaceDocument = HydratedDocument<WorkspaceRecord>;

@Schema({ collection: 'workspaces', timestamps: true, versionKey: false })
export class WorkspaceRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: Object, required: false, minimize: false })
  designSystemDraft?: Record<string, unknown>;

  @Prop({ type: Object, required: false, minimize: false })
  publishedDesignSystem?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkspaceSchema = SchemaFactory.createForClass(WorkspaceRecord);
WorkspaceSchema.path('designSystemDraft').validate(
  (value: unknown) =>
    value === undefined || SiteDesignSystemSchema.safeParse(value).success,
  'designSystemDraft must be a valid design system',
);
WorkspaceSchema.path('publishedDesignSystem').validate(
  (value: unknown) =>
    value === undefined || SiteDesignSystemSchema.safeParse(value).success,
  'publishedDesignSystem must be a valid design system',
);

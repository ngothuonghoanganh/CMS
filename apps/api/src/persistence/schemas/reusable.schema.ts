import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type ReusableDocument = HydratedDocument<ReusableRecord>;

@Schema({
  collection: 'reusables',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class ReusableRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, required: true, enum: ['section', 'component'] })
  kind!: 'section' | 'component';

  @Prop({ type: String, required: true, enum: ['active', 'archived'], default: 'active' })
  status!: 'active' | 'archived';

  @Prop({ type: Object, required: true, minimize: false })
  draft!: Record<string, unknown>;

  @Prop({ type: Object, required: false, minimize: false })
  published?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ReusableSchema = SchemaFactory.createForClass(ReusableRecord);
ReusableSchema.index({ workspaceId: 1, siteId: 1, status: 1, updatedAt: -1 });

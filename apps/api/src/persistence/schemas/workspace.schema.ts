import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type WorkspaceDocument = HydratedDocument<WorkspaceRecord>;

@Schema({ collection: 'workspaces', timestamps: true, versionKey: false })
export class WorkspaceRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkspaceSchema = SchemaFactory.createForClass(WorkspaceRecord);

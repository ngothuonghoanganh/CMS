import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type RoleAssignmentScope = 'tenant' | 'workspace';
export type RoleAssignmentDocument = HydratedDocument<RoleAssignmentRecord>;

@Schema({ collection: 'roleAssignments', timestamps: true, versionKey: false })
export class RoleAssignmentRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, index: true })
  roleId!: string;

  @Prop({ type: String, enum: ['tenant', 'workspace'], required: true, index: true })
  scope!: RoleAssignmentScope;

  @Prop({ type: String, required: false, index: true })
  workspaceId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoleAssignmentSchema = SchemaFactory.createForClass(RoleAssignmentRecord);
RoleAssignmentSchema.index(
  { userId: 1, roleId: 1, scope: 1, workspaceId: 1 },
  { unique: true },
);
RoleAssignmentSchema.index({ userId: 1, workspaceId: 1 });

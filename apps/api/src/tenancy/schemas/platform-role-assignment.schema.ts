import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PlatformRoleAssignmentDocument =
  HydratedDocument<PlatformRoleAssignmentRecord>;

@Schema({ collection: 'platformRoleAssignments', timestamps: true, versionKey: false })
export class PlatformRoleAssignmentRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  platformUserId!: string;

  @Prop({ type: String, required: true, index: true })
  roleId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlatformRoleAssignmentSchema = SchemaFactory.createForClass(
  PlatformRoleAssignmentRecord,
);
PlatformRoleAssignmentSchema.index({ platformUserId: 1, roleId: 1 }, { unique: true });

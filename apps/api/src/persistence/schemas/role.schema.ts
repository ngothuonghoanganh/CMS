import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantRoleType = 'system' | 'custom';
export type RoleDocument = HydratedDocument<RoleRecord>;

@Schema({ collection: 'roles', timestamps: true, versionKey: false, minimize: false })
export class RoleRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  key!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: String, enum: ['system', 'custom'], required: true })
  type!: TenantRoleType;

  @Prop({ type: [String], required: true, default: [] })
  permissions!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoleSchema = SchemaFactory.createForClass(RoleRecord);
RoleSchema.index({ key: 1 }, { unique: true });

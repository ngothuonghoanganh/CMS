import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PlatformRoleDocument = HydratedDocument<PlatformRoleRecord>;

@Schema({ collection: 'platformRoles', timestamps: true, versionKey: false })
export class PlatformRoleRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  key!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: [String], required: true, default: [] })
  permissions!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlatformRoleSchema = SchemaFactory.createForClass(PlatformRoleRecord);
PlatformRoleSchema.index({ key: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PlatformUserDocument = HydratedDocument<PlatformUserRecord>;

@Schema({ collection: 'platformUsers', timestamps: true, versionKey: false })
export class PlatformUserRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ type: String, enum: ['platform-admin'], required: true })
  role!: 'platform-admin';

  @Prop({ type: String, enum: ['active', 'disabled'], required: true })
  status!: 'active' | 'disabled';

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlatformUserSchema = SchemaFactory.createForClass(PlatformUserRecord);

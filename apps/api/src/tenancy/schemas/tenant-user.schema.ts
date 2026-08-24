import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantUserDocument = HydratedDocument<TenantUserRecord>;

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class TenantUserRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true,
  })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, enum: ['active', 'disabled'], required: true, default: 'active' })
  status!: 'active' | 'disabled';

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantUserSchema = SchemaFactory.createForClass(TenantUserRecord);

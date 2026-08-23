import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AuthSessionDocument = HydratedDocument<AuthSessionRecord>;

@Schema({ collection: 'authSessions', timestamps: false, versionKey: false })
export class AuthSessionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  principalId!: string;

  @Prop({ type: String, required: true })
  email!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  refreshTokenHash!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  lastUsedAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  replacedBySessionId!: string | null;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSessionRecord);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

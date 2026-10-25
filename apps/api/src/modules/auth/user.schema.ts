import { Schema, type Types } from 'mongoose';

export const USER_MODEL = 'User';
export const SESSION_MODEL = 'Session';

export interface UserRecord {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export const userSchema = new Schema<UserRecord>(
  {
    email: { type: String, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'users', versionKey: false },
);
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });

export interface SessionRecord {
  _id: Types.ObjectId;
  /** sha256 of the cookie token; the token itself is never stored. */
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

export const sessionSchema = new Schema<SessionRecord>(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'sessions', versionKey: false },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

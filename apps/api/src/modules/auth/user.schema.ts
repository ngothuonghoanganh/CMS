import { Schema, type Types } from 'mongoose';

export const USER_MODEL = 'User';
export const SESSION_MODEL = 'Session';
export const LOGIN_ATTEMPT_MODEL = 'LoginAttempt';

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

/** Unfinished login attempts of one account in the current window (ADR-004). */
export interface LoginAttemptRecord {
  _id: Types.ObjectId;
  /** sha256 of the normalised email: the email itself, which may not be an account, is not stored. */
  accountKey: string;
  count: number;
  /** End of the window; the TTL index removes the record afterwards. */
  expiresAt: Date;
}

export const LOGIN_ATTEMPTS_ACCOUNT_INDEX = 'login_attempts_account_unique';

export const loginAttemptSchema = new Schema<LoginAttemptRecord>(
  {
    accountKey: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'login_attempts', versionKey: false },
);
loginAttemptSchema.index({ accountKey: 1 }, { unique: true, name: LOGIN_ATTEMPTS_ACCOUNT_INDEX });
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

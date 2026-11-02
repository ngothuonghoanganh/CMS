import { Schema, type Types } from 'mongoose';

export const USER_MODEL = 'User';
export const SESSION_MODEL = 'Session';
export const LOGIN_ATTEMPT_MODEL = 'LoginAttempt';

export interface UserRecord {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  /**
   * Goes up with every reset or changed password (ADR-026); absent, on accounts from before it, is
   * 0. A session counts only while it was issued against the current one, so a login that read the
   * old password before a reset committed holds no session after it.
   */
  credentialsVersion?: number;
  createdAt: Date;
}

/** The credentials version of a user or session record: absent is 0. */
export function credentialsVersionOf(record: { credentialsVersion?: number }): number {
  return record.credentialsVersion ?? 0;
}

export const userSchema = new Schema<UserRecord>(
  {
    email: { type: String, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    credentialsVersion: { type: Number, default: 0 },
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
  /**
   * The `Domain` its cookie was set with (ADR-025); null or absent for a host-only cookie. A
   * session only counts while the API sets cookies the same way, so a cookie left from before a
   * change of mode never stands for anyone.
   */
  cookieDomain?: string | null;
  /**
   * The user's `credentialsVersion` when the session was issued; absent, on sessions from before
   * it, is 0. The session guard refuses it once the user's has moved on (ADR-026).
   */
  credentialsVersion?: number;
}

export const sessionSchema = new Schema<SessionRecord>(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    cookieDomain: { type: String, default: null },
    credentialsVersion: { type: Number, default: 0 },
  },
  { collection: 'sessions', versionKey: false },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// A reset or changed password ends the user's (other) sessions (ADR-026).
sessionSchema.index({ userId: 1 }, { name: 'sessions_user' });

/** Unfinished login attempts of one account in the current window (ADR-004). */
export interface LoginAttemptRecord {
  _id: Types.ObjectId;
  /**
   * HMAC of the normalised email (`loginAccountKey`): the email itself, which may not be an
   * account, is not stored, and the database alone cannot tell which email a key belongs to.
   */
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

import { Schema, type Types } from 'mongoose';

export const PENDING_SIGNUP_MODEL = 'PendingSignup';
export const PASSWORD_RESET_MODEL = 'PasswordReset';
export const AUTH_EMAIL_LIMIT_MODEL = 'AuthEmailLimit';

/**
 * A sign-up waiting for its email to be confirmed (ADR-026): no account, workspace or database
 * exists for it yet. One per email; signing up again replaces it, so an older link stops working.
 * No password: whoever opens the link chooses it, so a sign-up made with someone else's email
 * gives its maker nothing.
 */
export interface PendingSignupRecord {
  _id: Types.ObjectId;
  email: string;
  /** As typed in the form; the link's page may correct it. */
  name: string;
  workspaceName: string;
  /** sha256 of the link's secret; the secret itself is only in the email. */
  tokenHash: string;
  /** When the link stops working; the TTL index removes the record afterwards. */
  expiresAt: Date;
  createdAt: Date;
}

export const PENDING_SIGNUPS_EMAIL_INDEX = 'pending_signups_email_unique';

export const pendingSignupSchema = new Schema<PendingSignupRecord>(
  {
    email: { type: String, required: true },
    name: { type: String, required: true },
    workspaceName: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'pending_signups', versionKey: false },
);
pendingSignupSchema.index({ email: 1 }, { unique: true, name: PENDING_SIGNUPS_EMAIL_INDEX });
pendingSignupSchema.index({ tokenHash: 1 }, { unique: true, name: 'pending_signups_token_unique' });
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** A password reset link (ADR-026): one per user, a new one replaces it. */
export interface PasswordResetRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export const PASSWORD_RESETS_USER_INDEX = 'password_resets_user_unique';

export const passwordResetSchema = new Schema<PasswordResetRecord>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'password_resets', versionKey: false },
);
passwordResetSchema.index({ userId: 1 }, { unique: true, name: PASSWORD_RESETS_USER_INDEX });
passwordResetSchema.index({ tokenHash: 1 }, { unique: true, name: 'password_resets_token_unique' });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Account emails one address received in the current hour (ADR-026). */
export interface AuthEmailLimitRecord {
  _id: Types.ObjectId;
  /** HMAC of the normalised email, like the key of `login_attempts` (`loginAccountKey`). */
  key: string;
  count: number;
  /** End of the window; the TTL index removes the record afterwards. */
  expiresAt: Date;
}

export const AUTH_EMAIL_LIMITS_KEY_INDEX = 'auth_email_limits_key_unique';

export const authEmailLimitSchema = new Schema<AuthEmailLimitRecord>(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'auth_email_limits', versionKey: false },
);
authEmailLimitSchema.index({ key: 1 }, { unique: true, name: AUTH_EMAIL_LIMITS_KEY_INDEX });
authEmailLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

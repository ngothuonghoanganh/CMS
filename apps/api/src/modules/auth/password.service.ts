import { Injectable } from '@nestjs/common';
import {
  type AccountEmailRequest,
  type AccountEmailResponse,
  type ChangePasswordRequest,
  RESET_LINK_VALID_MINUTES,
  RESET_PASSWORD_PATH,
  type ResetPasswordRequest,
} from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { passwordResetEmail } from '../notifications/emails.js';
import { AccountEmails } from './account-emails.js';
import { accountLink, hashLinkToken, newLinkToken, resetLinkExpiry } from './account-links.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { PasswordAttempts, type PasswordCheckUse } from './password-attempts.js';
import { PasswordResetsRepository } from './password-resets.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { SessionsRepository } from './sessions.repository.js';
import { credentialsVersionOf } from './user.schema.js';
import { UsersRepository } from './users.repository.js';

function resetLinkInvalid(): AppError {
  return new AppError(410, 'reset_link_invalid', 'Link đặt lại mật khẩu không còn dùng được', {
    detail:
      'Link đã được dùng, đã hết hạn hoặc không đúng. Hãy yêu cầu link mới ở "Quên mật khẩu".',
  });
}

const WRONG_CURRENT_PASSWORD = 'Mật khẩu hiện tại không đúng';

/** A reset or another change committed between proving the current password and writing. */
function passwordChanged(): AppError {
  return new AppError(409, 'password_changed', 'Mật khẩu vừa được đổi ở nơi khác. Đăng nhập lại.');
}

/** A wrong current password costs an attempt of the account's login limit (ADR-004). */
const CHANGE: PasswordCheckUse = {
  what: 'Password change',
  tooMany: (minutes) =>
    new AppError(429, 'rate_limited', 'Nhập sai mật khẩu quá nhiều lần', {
      detail: `Tài khoản này tạm dừng đăng nhập và đổi mật khẩu vì nhập sai quá nhiều lần. Thử lại sau ${String(minutes)} phút.`,
    }),
};

/** A forgotten password, set again from an emailed link, and a changed one (ADR-026). */
@Injectable()
export class PasswordService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly auth: AuthService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly resets: PasswordResetsRepository,
    private readonly passwordAttempts: PasswordAttempts,
    private readonly emails: AccountEmails,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Emails a reset link, valid 60 minutes, when the email has an account; the user's earlier link
   * stops working. The answer is the same either way.
   */
  async forgot(input: AccountEmailRequest): Promise<AccountEmailResponse> {
    const now = new Date();
    await this.emails.deliver(input.email, now, 'Password reset email', async () => {
      const user = await this.users.findByEmail(input.email);
      if (user === null) {
        return null;
      }
      const { token, tokenHash } = newLinkToken();
      const expiresAt = resetLinkExpiry(now);
      await this.resets.replace(user._id, tokenHash, expiresAt, now);
      return passwordResetEmail({
        userId: user._id.toHexString(),
        linkExpiresAt: expiresAt,
        resetUrl: accountLink(this.env.ADMIN_ORIGIN, RESET_PASSWORD_PATH, token),
        validMinutes: RESET_LINK_VALID_MINUTES,
      });
    });
    return { email: input.email };
  }

  /**
   * Sets the new password, uses up the link and ends every session of the user in one
   * transaction: whoever forgot their password may have lost a device too. The new credentials
   * version also refuses a session a racing login creates afterwards, from the old password it
   * read before (ADR-026). The account's failed logins stop counting in the same transaction, so a
   * reset never leaves the account held back. Then the user is signed in as by a login.
   */
  async reset(input: ResetPasswordRequest): Promise<IssuedSession> {
    const tokenHash = hashLinkToken(input.token);
    const reset = await this.resets.findActiveByTokenHash(tokenHash, new Date());
    const user = reset === null ? null : await this.users.findById(reset.userId);
    if (reset === null || user === null) {
      throw resetLinkInvalid();
    }
    const passwordHash = await hashPassword(input.password);
    const credentialsVersion = await this.transactions.run(async (tx) => {
      // Used or replaced since it was read: this link no longer counts.
      if (!(await this.resets.claim(reset._id, tokenHash, tx))) {
        throw resetLinkInvalid();
      }
      const version = await this.users.setPassword(user._id, passwordHash, tx);
      if (version === null) {
        throw resetLinkInvalid();
      }
      await this.sessions.deleteForUser(user._id, tx);
      await this.passwordAttempts.clear(user.email, tx);
      return version;
    });
    return this.auth.issueSession(
      { id: user._id, name: user.name, email: user.email },
      credentialsVersion,
    );
  }

  /**
   * Changes the password of the signed-in user, who proves the current one: a stolen session
   * alone cannot change it, nor guess it faster than the login limit allows. The user's other
   * sessions end; this one stays, under the new credentials version. The write holds only while
   * the password proven is still the user's: after a reset or another change meanwhile it is a
   * 409, which changes nothing (ADR-026).
   */
  async change(
    user: AuthenticatedUser,
    sessionId: ObjectId,
    input: ChangePasswordRequest,
  ): Promise<void> {
    const proven = await this.passwordAttempts.check(user.email, CHANGE, async () => {
      const stored = await this.users.findById(user.id);
      return stored !== null && (await verifyPassword(stored.passwordHash, input.currentPassword))
        ? stored
        : null;
    });
    if (proven === null) {
      throw new AppError(422, 'invalid_credentials', WRONG_CURRENT_PASSWORD, {
        issues: [
          {
            path: ['currentPassword'],
            code: 'invalid_credentials',
            message: WRONG_CURRENT_PASSWORD,
          },
        ],
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.transactions.run(async (tx) => {
      const version = await this.users.setPassword(user.id, passwordHash, tx, {
        passwordHash: proven.passwordHash,
        credentialsVersion: credentialsVersionOf(proven),
      });
      if (version === null) {
        throw passwordChanged();
      }
      await this.sessions.deleteForUser(user.id, tx, sessionId);
      await this.sessions.setCredentialsVersion(sessionId, version, tx);
    });
  }
}

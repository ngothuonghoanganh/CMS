import { Injectable, Logger } from '@nestjs/common';
import { ACCOUNT_EMAILS_PER_HOUR } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import { mailboxOf } from '../../shared/mailbox.js';
import { EmailSender, EmailSendError } from '../notifications/email-sender.js';
import type { KeyedEmail } from '../notifications/emails.js';
import { AuthEmailLimitsRepository } from './auth-email-limits.repository.js';
import type { AttemptWindow } from './login-attempts.repository.js';
import { loginAccountKey } from './login-attempts.repository.js';

const HOUR_MS = 3_600_000;

function tooManyEmails(): AppError {
  return new AppError(429, 'rate_limited', 'Đã gửi quá nhiều email tới hộp thư này', {
    detail: `Mỗi hộp thư nhận tối đa ${ACCOUNT_EMAILS_PER_HOUR} email tài khoản trong 60 phút. Hãy kiểm tra hộp thư, kể cả mục spam, hoặc thử lại sau.`,
  });
}

function emailUnavailable(): AppError {
  return new AppError(503, 'email_unavailable', 'Chưa gửi được email, thử lại sau ít phút');
}

/**
 * Emails about an account (ADR-026): sign-up confirmations, sent again, password resets and
 * "already has an account". Each mailbox receives at most `ACCOUNT_EMAILS_PER_HOUR` an hour,
 * counted in MongoDB for every API instance under an HMAC of the mailbox, as failed logins are
 * under one of the address. Per mailbox, like invitations (ADR-021): `an+1@gmail.com`,
 * `a.n+2@gmail.com`… would otherwise each bring their own emails into one inbox.
 */
@Injectable()
export class AccountEmails {
  private readonly logger = new Logger(AccountEmails.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly limits: AuthEmailLimitsRepository,
    private readonly sender: EmailSender,
  ) {}

  /**
   * Counts an email to `email` before anything is stored, then runs `prepare`, which stores what
   * the email is about and returns it, or null when there is nothing to send (no account, no
   * sign-up waiting). The request counts either way, so the limit answers the same (429) whether
   * the email has an account or not. A refused request is not given back: the window ends at the
   * same time anyway. When the email does not go out, the count is given back, and an SMTP
   * server that took nothing is a 503 the user can retry; what `prepare` stored is kept.
   */
  async deliver(
    email: string,
    now: Date,
    what: string,
    prepare: () => Promise<KeyedEmail | null>,
  ): Promise<void> {
    const key = loginAccountKey(this.env.LOGIN_ATTEMPT_SECRET, mailboxOf(email));
    const counted = await this.limits.count(key, now, new Date(now.getTime() + HOUR_MS));
    if (counted.count > ACCOUNT_EMAILS_PER_HOUR) {
      throw tooManyEmails();
    }
    let content: KeyedEmail | null;
    try {
      content = await prepare();
      if (content !== null) {
        await this.sender.send({ to: [email], ...content });
      }
    } catch (error) {
      await this.giveBack(key, counted, what);
      if (error instanceof EmailSendError) {
        // Only the code: the SMTP server's answer may quote the address.
        this.logger.warn({ code: error.code }, `${what} not sent`);
        throw emailUnavailable();
      }
      throw error;
    }
  }

  /**
   * The request keeps its outcome when giving back fails: the email stays counted, the safe side
   * (the window ends within the hour), and the failure is logged without the key, which stands
   * for an address.
   */
  private async giveBack(key: string, counted: AttemptWindow, what: string): Promise<void> {
    try {
      await this.limits.giveBack(key, counted, new Date());
    } catch (error) {
      this.logger.error({ err: error }, `${what} still counted: giving it back failed`);
    }
  }
}

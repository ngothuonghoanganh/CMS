import type { OnModuleDestroy } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env.js';
import { smtpErrorCode } from './domain/notification-rules.js';
import {
  type EmailDelivery,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from './email-sender.js';
import { type RenderedEmail, renderEmail } from './email-templates.js';

/** A slow or silent server fails the attempt instead of holding it for minutes. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

/** A rendered email with its addresses, as the SMTP server takes it. */
export type RenderedMessage = RenderedEmail & { to: readonly string[] };

/** Sends through the SMTP server of `SMTP_URL` (Mailpit in development and tests, ADR-018). */
export class SmtpEmailSender implements OnModuleDestroy {
  private readonly transport;

  constructor(env: Env) {
    if (env.MAIL_TRANSPORT !== 'smtp') {
      throw new Error(`SMTP is not the mail transport: MAIL_TRANSPORT is ${env.MAIL_TRANSPORT}`);
    }
    this.transport = createTransport(
      { url: env.SMTP_URL, ...TIMEOUTS },
      { from: env.LEAD_EMAIL_FROM },
    );
  }

  async send(message: RenderedMessage): Promise<EmailDelivery> {
    let info;
    try {
      info = await this.transport.sendMail({
        to: [...message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      throw new EmailSendError(smtpErrorCode(error), { cause: error });
    }
    const rejected = info.rejected.length;
    return {
      accepted: info.accepted.length,
      rejected,
      rejectionCode: rejected === 0 ? null : smtpErrorCode(info.rejectedErrors?.[0]),
    };
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}

/**
 * Email over SMTP: renders each email here (`email-templates.ts`), with the API's own texts, then
 * hands it to `SmtpEmailSender` (ADR-018).
 */
export class SmtpTemplateSender extends EmailSender implements OnModuleDestroy {
  constructor(private readonly smtp: SmtpEmailSender) {
    super();
  }

  send(message: EmailMessage): Promise<EmailDelivery> {
    return this.smtp.send({ to: message.to, ...renderEmail(message) });
  }

  onModuleDestroy(): void {
    this.smtp.onModuleDestroy();
  }
}

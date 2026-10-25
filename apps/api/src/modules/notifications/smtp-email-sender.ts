import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { smtpErrorCode } from './domain/notification-rules.js';
import {
  type EmailDelivery,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from './email-sender.js';

/** A slow or silent server fails the attempt instead of holding it for minutes. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

/** Sends through the SMTP server of `SMTP_URL` (Mailpit in development and tests, ADR-018). */
@Injectable()
export class SmtpEmailSender extends EmailSender implements OnModuleDestroy {
  private readonly transport;

  constructor(@InjectEnv() env: Env) {
    super();
    this.transport = createTransport(
      { url: env.SMTP_URL, ...TIMEOUTS },
      { from: env.LEAD_EMAIL_FROM },
    );
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
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

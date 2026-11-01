import type { OnModuleDestroy } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { SmtpMailEnv } from '../../config/env.js';
import { smtpErrorCode } from './domain/notification-rules.js';
import {
  type EmailDelivery,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from './email-sender.js';
import { renderEmail } from './email-templates.js';

/** A slow or silent server fails the attempt instead of holding it for minutes. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

/**
 * Renders each email here and sends it through the SMTP server of `SMTP_URL` (Mailpit in
 * development and tests, ADR-018).
 */
export class SmtpEmailSender extends EmailSender implements OnModuleDestroy {
  private readonly transport;

  constructor(env: Pick<SmtpMailEnv, 'SMTP_URL' | 'LEAD_EMAIL_FROM'>) {
    super();
    this.transport = createTransport(
      { url: env.SMTP_URL, ...TIMEOUTS },
      { from: env.LEAD_EMAIL_FROM },
    );
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const { subject, text, html } = renderEmail(message);
    let info;
    try {
      info = await this.transport.sendMail({ to: [...message.to], subject, text, html });
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

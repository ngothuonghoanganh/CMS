import { Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { EmailQuota } from './email-quota.js';
import { EmailSender } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';
import { SqsEmailSender } from './sqs-email-sender.js';

/** The transport `MAIL_TRANSPORT` picks: SMTP by default, or the plp-mailer queue (ADR-023). */
function emailSenderFor(env: Env): EmailSender {
  return env.MAIL_TRANSPORT === 'sqs' ? new SqsEmailSender(env) : new SmtpEmailSender(env);
}

/** Sending email, and the daily limits on emails sent for people (ADR-018, ADR-021, ADR-023). */
@Module({
  imports: [LeadsCoreModule],
  providers: [{ provide: EmailSender, inject: [ENV], useFactory: emailSenderFor }, EmailQuota],
  exports: [EmailSender, EmailQuota],
})
export class EmailModule {}

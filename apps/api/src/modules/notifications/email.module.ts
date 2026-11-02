import { Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { EmailQuota } from './email-quota.js';
import { EmailSender } from './email-sender.js';
import { SmtpEmailSender, SmtpTemplateSender } from './smtp-email-sender.js';

function emailSenderFor(env: Env): EmailSender {
  return new SmtpTemplateSender(new SmtpEmailSender(env));
}

/** Sending email, and the daily limits on emails sent for people (ADR-018, ADR-021). */
@Module({
  imports: [LeadsCoreModule],
  providers: [{ provide: EmailSender, inject: [ENV], useFactory: emailSenderFor }, EmailQuota],
  exports: [EmailSender, EmailQuota],
})
export class EmailModule {}

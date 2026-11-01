import { Module } from '@nestjs/common';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { EmailQuota } from './email-quota.js';
import { EmailSender } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/** Sending email, and the daily limits on emails sent for people (ADR-018, ADR-021). */
@Module({
  imports: [LeadsCoreModule],
  providers: [{ provide: EmailSender, useClass: SmtpEmailSender }, EmailQuota],
  exports: [EmailSender, EmailQuota],
})
export class EmailModule {}

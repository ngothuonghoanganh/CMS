import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { NOTIFICATION_RETRY_DELAYS_MS } from './domain/notification-rules.js';
import { EmailSender } from './email-sender.js';
import { LeadNotifier, NOTIFICATION_RETRY_DELAYS } from './lead-notifier.service.js';
import { LeadRecipientsController } from './lead-recipients.controller.js';
import { LeadRecipientsService } from './lead-recipients.service.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/**
 * Lead recipients and email notifications (ADR-018). Exports the notifier to lead intake, which
 * hands it every new lead that is not spam.
 */
@Module({
  imports: [ActivityModule, LeadsCoreModule, PagesModule, SitesCoreModule, WorkspacesModule],
  controllers: [LeadRecipientsController],
  providers: [
    { provide: EmailSender, useClass: SmtpEmailSender },
    { provide: NOTIFICATION_RETRY_DELAYS, useValue: NOTIFICATION_RETRY_DELAYS_MS },
    LeadNotifier,
    LeadRecipientsService,
  ],
  exports: [LeadNotifier],
})
export class NotificationsModule {}

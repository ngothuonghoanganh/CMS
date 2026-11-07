import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ContactsCoreModule } from '../contacts/contacts-core.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AutomationRunner } from './automation-runner.service.js';
import { AutomationScheduler } from './automation-scheduler.service.js';
import { AutomationsController } from './automations.controller.js';
import { AutomationsCoreModule } from './automations-core.module.js';
import { AutomationsService } from './automations.service.js';
import { WebhookSender } from './webhook-sender.js';

/** The automations screen and the queue that runs them on every API instance (ADR-034). */
@Module({
  imports: [
    ActivityModule,
    AuthModule,
    AutomationsCoreModule,
    ContactsCoreModule,
    ContactsModule,
    EmailModule,
    LeadsCoreModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationRunner, AutomationScheduler, WebhookSender],
  exports: [AutomationScheduler],
})
export class AutomationsModule {}

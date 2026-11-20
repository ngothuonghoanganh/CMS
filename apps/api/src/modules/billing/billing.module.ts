import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { BillingController } from './billing.controller.js';
import { BillingCoreModule } from './billing-core.module.js';
import { BillingService } from './billing.service.js';
import { SubscriptionBackfill } from './subscription-backfill.service.js';
import { TestClockController } from './test-clock.controller.js';

/** The endpoints of plans and billing (ADR-035), and the trials of workspaces made before them. */
@Module({
  imports: [BillingCoreModule, WorkspacesModule],
  controllers: [BillingController, TestClockController],
  providers: [BillingService, SubscriptionBackfill],
})
export class BillingModule {}

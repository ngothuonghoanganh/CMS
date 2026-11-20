import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { DOMAIN_MODEL, domainSchema } from '../domains/domain.schema.js';
import { INVITATION_MODEL, invitationSchema } from '../workspaces/invitation.schema.js';
import { MEMBERSHIP_MODEL, membershipSchema } from '../workspaces/workspace.schema.js';
import { BillingClock } from './billing-clock.js';
import { BILLING_LOG_MODEL, billingLogSchema } from './billing-log.schema.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { EntitlementsService } from './entitlements.service.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { loadPlanCatalog, PLAN_CATALOG } from './plan-catalog.js';
import { PlanUsageRepository } from './plan-usage.repository.js';
import { SUBSCRIPTION_MODEL, subscriptionSchema } from './subscription.schema.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/**
 * Plans, subscriptions and entitlements (ADR-035), without the endpoints: any module may import it
 * to check a limit or a feature, the workspaces module included (read-only access), since it
 * depends on no feature module.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SUBSCRIPTION_MODEL, schema: subscriptionSchema },
      { name: BILLING_LOG_MODEL, schema: billingLogSchema },
      // Counted against the plan's limits; their own modules write them.
      { name: MEMBERSHIP_MODEL, schema: membershipSchema },
      { name: INVITATION_MODEL, schema: invitationSchema },
      { name: DOMAIN_MODEL, schema: domainSchema },
    ]),
  ],
  providers: [
    // Read once at startup: an invalid file stops the API before it serves (ADR-035).
    {
      provide: PLAN_CATALOG,
      inject: [ENV],
      useFactory: (env: Env) => loadPlanCatalog(env.PLAN_CATALOG_FILE),
    },
    BillingClock,
    SubscriptionsRepository,
    BillingLogRepository,
    PlanUsageRepository,
    EntitlementsService,
    PlanChangeHooks,
  ],
  exports: [
    PLAN_CATALOG,
    BillingClock,
    SubscriptionsRepository,
    BillingLogRepository,
    EntitlementsService,
    PlanChangeHooks,
  ],
})
export class BillingCoreModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { TenantRecord, TenantSchema } from '../tenancy/schemas/tenant.schema';
import { BillingEventRecord, BillingEventSchema } from './schemas/billing-event.schema';
import { PlanRecord, PlanSchema } from './schemas/plan.schema';
import {
  TenantSubscriptionRecord,
  TenantSubscriptionSchema,
} from './schemas/tenant-subscription.schema';
import { TenantUsageRecord, TenantUsageSchema } from './schemas/tenant-usage.schema';
import { PlanService } from './plan.service';
import { QuotaService } from './quota.service';
import { SubscriptionService } from './subscription.service';
import { UsageService } from './usage.service';

@Module({
  imports: [
    TenantModule,
    TenantModelsModule,
    MongooseModule.forFeature(
      [
        { name: TenantRecord.name, schema: TenantSchema },
        { name: PlanRecord.name, schema: PlanSchema },
        { name: TenantSubscriptionRecord.name, schema: TenantSubscriptionSchema },
        { name: TenantUsageRecord.name, schema: TenantUsageSchema },
        { name: BillingEventRecord.name, schema: BillingEventSchema },
      ],
      MASTER_CONNECTION,
    ),
  ],
  providers: [PlanService, SubscriptionService, UsageService, QuotaService],
  exports: [PlanService, SubscriptionService, UsageService, QuotaService],
})
export class BillingCoreModule {}

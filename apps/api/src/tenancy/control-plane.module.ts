import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BillingCoreModule } from '../billing/billing-core.module';
import { MASTER_CONNECTION } from './master-connection';
import { TenantDomainRecord, TenantDomainSchema } from './schemas/tenant-domain.schema';
import { TenantRecord, TenantSchema } from './schemas/tenant.schema';
import { PlatformUserRecord, PlatformUserSchema } from './schemas/platform-user.schema';
import { PlatformRoleRecord, PlatformRoleSchema } from './schemas/platform-role.schema';
import {
  PlatformRoleAssignmentRecord,
  PlatformRoleAssignmentSchema,
} from './schemas/platform-role-assignment.schema';
import {
  PlatformAuditLogRecord,
  PlatformAuditLogSchema,
} from './schemas/platform-audit-log.schema';
import { TenantResolver } from './tenant-resolver';
import { TenantModule } from './tenant.module';
import { TenantModelsModule } from './tenant-models.module';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  exports: [
    MongooseModule,
    BillingCoreModule,
    TenantResolver,
    TenantModule,
    TenantProvisioningService,
  ],
  imports: [
    BillingCoreModule,
    TenantModule,
    TenantModelsModule,
    MongooseModule.forFeature(
      [
        { name: TenantRecord.name, schema: TenantSchema },
        { name: TenantDomainRecord.name, schema: TenantDomainSchema },
        { name: PlatformUserRecord.name, schema: PlatformUserSchema },
        { name: PlatformRoleRecord.name, schema: PlatformRoleSchema },
        { name: PlatformRoleAssignmentRecord.name, schema: PlatformRoleAssignmentSchema },
        { name: PlatformAuditLogRecord.name, schema: PlatformAuditLogSchema },
      ],
      MASTER_CONNECTION,
    ),
  ],
  providers: [TenantResolver, TenantProvisioningService],
})
export class ControlPlaneModule {}

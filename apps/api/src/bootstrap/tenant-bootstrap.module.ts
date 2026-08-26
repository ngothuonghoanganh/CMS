import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MASTER_CONNECTION } from '../tenancy/master-connection';
import {
  TenantDomainRecord,
  TenantDomainSchema,
} from '../tenancy/schemas/tenant-domain.schema';
import { TenantRecord, TenantSchema } from '../tenancy/schemas/tenant.schema';
import { ControlPlaneModule } from '../tenancy/control-plane.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    ControlPlaneModule,
    TenantModelsModule,
    SecurityModule,
    MongooseModule.forFeature(
      [
        { name: TenantRecord.name, schema: TenantSchema },
        { name: TenantDomainRecord.name, schema: TenantDomainSchema },
      ],
      MASTER_CONNECTION,
    ),
  ],
  providers: [TenantBootstrapService],
})
export class TenantBootstrapModule {}

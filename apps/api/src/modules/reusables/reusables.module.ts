import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { NavigationModule } from '../navigation/navigation.module';
import { ReusableController } from './reusable.controller';
import { ReusableService } from './reusable.service';

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    TenantModelsModule,
    TenantModule,
    NavigationModule,
  ],
  controllers: [ReusableController],
  providers: [ReusableService],
  exports: [ReusableService],
})
export class ReusablesModule {}

import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { ControlPlaneModule } from './control-plane.module';
import { TenantController } from './tenant.controller';
import { TenantModelsModule } from './tenant-models.module';
import { TenantModule } from './tenant.module';

@Module({
  controllers: [TenantController],
  imports: [AuthenticationModule, ControlPlaneModule, TenantModelsModule, TenantModule],
})
export class TenantManagementModule {}

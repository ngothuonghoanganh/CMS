import { Module } from '@nestjs/common';

import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationService } from './authentication.service';
import { ControlPlaneModule } from '../../tenancy/control-plane.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';

@Module({
  imports: [ControlPlaneModule, TenantModelsModule, TenantModule],
  exports: [AuthenticationGuard, AuthenticationService],
  providers: [AuthenticationGuard, AuthenticationService],
})
export class AuthenticationModule {}

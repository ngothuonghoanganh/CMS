import { Module } from '@nestjs/common';

import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationService } from './authentication.service';
import { ControlPlaneModule } from '../../tenancy/control-plane.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { AuthorizationService } from '../../security/authorization.service';

@Module({
  imports: [ControlPlaneModule, TenantModelsModule, TenantModule],
  exports: [AuthenticationGuard, AuthenticationService],
  providers: [AuthorizationService, AuthenticationGuard, AuthenticationService],
})
export class AuthenticationModule {}

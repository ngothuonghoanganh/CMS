import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import {
  NavigationController,
  WorkspaceNavigationController,
} from './navigation.controller';
import { NavigationService } from './navigation.service';

@Module({
  imports: [AuthenticationModule, SecurityModule, TenantModelsModule, TenantModule],
  controllers: [NavigationController, WorkspaceNavigationController],
  providers: [NavigationService],
  exports: [NavigationService],
})
export class NavigationModule {}

import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { ControlPlaneModule } from '../../tenancy/control-plane.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { NavigationModule } from '../navigation/navigation.module';
import { ReusablesModule } from '../reusables/reusables.module';
import { SiteController } from './site.controller';
import {
  SiteNavigationAdapter,
  SITE_NAVIGATION_PORT_PROVIDER,
} from './site-navigation.adapter';
import {
  SiteReusableAdapter,
  SITE_REUSABLE_PORT_PROVIDER,
} from './site-reusable.adapter';
import { SiteService } from './site.service';
import { SiteUrlService } from './site-url.service';

@Module({
  imports: [
    AuthenticationModule,
    ControlPlaneModule,
    SecurityModule,
    TenantModelsModule,
    TenantModule,
    NavigationModule,
    ReusablesModule,
  ],
  controllers: [SiteController],
  providers: [
    SiteService,
    SiteUrlService,
    SiteNavigationAdapter,
    SITE_NAVIGATION_PORT_PROVIDER,
    SiteReusableAdapter,
    SITE_REUSABLE_PORT_PROVIDER,
  ],
  exports: [SiteService, SiteUrlService],
})
export class SiteModule {}

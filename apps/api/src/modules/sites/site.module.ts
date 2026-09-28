import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { ControlPlaneModule } from '../../tenancy/control-plane.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { NavigationModule } from '../navigation/navigation.module';
import { SiteController } from './site.controller';
import {
  SiteNavigationAdapter,
  SITE_NAVIGATION_PORT_PROVIDER,
} from './site-navigation.adapter';
import { CoreSiteReusableAdapter } from './core-site-reusable.adapter';
import { SiteService } from './site.service';
import { SiteUrlService } from './site-url.service';
import {
  SITE_REUSABLE_IMPLEMENTATION,
  SITE_REUSABLE_PORT,
  type SiteReusablePort,
} from '../../shared/site-reusable-port';

@Module({
  imports: [
    AuthenticationModule,
    ControlPlaneModule,
    SecurityModule,
    TenantModelsModule,
    TenantModule,
    NavigationModule,
  ],
  controllers: [SiteController],
  providers: [
    SiteService,
    SiteUrlService,
    SiteNavigationAdapter,
    SITE_NAVIGATION_PORT_PROVIDER,
    CoreSiteReusableAdapter,
    {
      provide: SITE_REUSABLE_PORT,
      useFactory: (
        platform: SiteReusablePort | undefined,
        core: CoreSiteReusableAdapter,
      ) => platform ?? core,
      inject: [
        { token: SITE_REUSABLE_IMPLEMENTATION, optional: true },
        CoreSiteReusableAdapter,
      ],
    },
  ],
  exports: [SiteService, SiteUrlService],
})
export class SiteModule {}

import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { CoreEventsModule } from '../../shared/events/core-events.module';
import {
  CUSTOM_DOMAIN_EVENT_IMPLEMENTATION,
  CUSTOM_DOMAIN_EVENT_PORT,
  type CustomDomainEventPort,
} from '../../shared/custom-domain-event-port';
import {
  CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION,
  CUSTOM_DOMAIN_QUOTA_PORT,
  type CustomDomainQuotaPort,
} from '../../shared/custom-domain-quota-port';
import {
  SEO_COLLECTION_IMPLEMENTATION,
  SEO_COLLECTION_PORT,
  type SeoCollectionPort,
} from '../../shared/seo-collection-port';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { ControlPlaneModule } from '../../tenancy/control-plane.module';
import { PagesModule } from '../pages/pages.module';
import { SiteModule } from '../sites/site.module';
import {
  CoreCustomDomainEventAdapter,
  CoreCustomDomainQuotaAdapter,
  CoreSeoCollectionAdapter,
} from './core-public-capabilities';
import {
  CustomDomainController,
  PublicDomainController,
} from './custom-domain.controller';
import {
  DOMAIN_VERIFICATION_RESOLVER,
  InMemoryDomainVerificationResolver,
  NodeDomainVerificationResolver,
} from './domain-verification-resolver';
import { env } from '../../config/env';
import { PublicPageController } from './public-page.controller';
import { PublicPageResolver } from './public-page.resolver';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CustomDomainService } from './custom-domain.service';

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    CoreEventsModule,
    ControlPlaneModule,
    TenantModelsModule,
    TenantModule,
    PagesModule,
    SiteModule,
  ],
  controllers: [
    PublicPageController,
    CustomDomainController,
    PublicDomainController,
    SeoController,
  ],
  providers: [
    PublicPageResolver,
    SeoService,
    CustomDomainService,
    CoreCustomDomainQuotaAdapter,
    {
      provide: CUSTOM_DOMAIN_QUOTA_PORT,
      useFactory: (
        platform: CustomDomainQuotaPort | undefined,
        core: CoreCustomDomainQuotaAdapter,
      ) => platform ?? core,
      inject: [
        { token: CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION, optional: true },
        CoreCustomDomainQuotaAdapter,
      ],
    },
    CoreCustomDomainEventAdapter,
    {
      provide: CUSTOM_DOMAIN_EVENT_PORT,
      useFactory: (
        platform: CustomDomainEventPort | undefined,
        core: CoreCustomDomainEventAdapter,
      ) => platform ?? core,
      inject: [
        { token: CUSTOM_DOMAIN_EVENT_IMPLEMENTATION, optional: true },
        CoreCustomDomainEventAdapter,
      ],
    },
    CoreSeoCollectionAdapter,
    {
      provide: SEO_COLLECTION_PORT,
      useFactory: (
        platform: SeoCollectionPort | undefined,
        core: CoreSeoCollectionAdapter,
      ) => platform ?? core,
      inject: [
        { token: SEO_COLLECTION_IMPLEMENTATION, optional: true },
        CoreSeoCollectionAdapter,
      ],
    },
    {
      provide: DOMAIN_VERIFICATION_RESOLVER,
      useFactory: () =>
        env.DOMAIN_VERIFICATION_PROVIDER === 'fake'
          ? new InMemoryDomainVerificationResolver()
          : new NodeDomainVerificationResolver(),
    },
  ],
  exports: [PublicPageResolver, SeoService, CustomDomainService],
})
export class PublicDeliveryModule {}

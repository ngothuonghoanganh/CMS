import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { CoreEventsModule } from '../../shared/events/core-events.module';
import {
  PAGE_COLLECTION_IMPLEMENTATION,
  PAGE_COLLECTION_PORT,
  type PageCollectionPort,
} from '../../shared/page-collection-port';
import {
  PAGE_EXTENSION_IMPLEMENTATION,
  PAGE_EXTENSION_PORT,
  type PageExtensionPort,
} from '../../shared/page-extension-port';
import {
  PAGE_LAYOUT_IMPLEMENTATION,
  PAGE_LAYOUT_PORT,
  type PageLayoutPort,
} from '../../shared/page-layout-port';
import {
  PAGE_PUBLISH_COMPATIBILITY,
  PAGE_PUBLISH_COMPATIBILITY_IMPLEMENTATION,
  type PagePublishCompatibility,
} from '../../shared/page-publish-compatibility';
import {
  PAGE_REUSABLE_IMPLEMENTATION,
  PAGE_REUSABLE_PORT,
  type PageReusablePort,
} from '../../shared/page-reusable-port';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { NavigationModule } from '../navigation/navigation.module';
import { SiteModule } from '../sites/site.module';
import {
  PageNavigationAdapter,
  PAGE_NAVIGATION_PORT_PROVIDER,
} from '../../domain/page-navigation.adapter';
import { PAGE_NAVIGATION_PORT } from '../../shared/page-navigation-port';
import {
  CorePageCollectionAdapter,
  CorePageExtensionAdapter,
  CorePageLayoutAdapter,
  CorePageReusableAdapter,
} from './core-page-capabilities';
import {
  PageController,
  PreviewPageController,
  SitePagesController,
} from './page.controller';
import { PageService } from './page.service';

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    CoreEventsModule,
    TenantModelsModule,
    TenantModule,
    NavigationModule,
    SiteModule,
  ],
  controllers: [PageController, PreviewPageController, SitePagesController],
  providers: [
    PageService,
    PageNavigationAdapter,
    PAGE_NAVIGATION_PORT_PROVIDER,
    CorePageExtensionAdapter,
    {
      provide: PAGE_EXTENSION_PORT,
      useFactory: (
        platform: PageExtensionPort | undefined,
        core: CorePageExtensionAdapter,
      ) => platform ?? core,
      inject: [
        { token: PAGE_EXTENSION_IMPLEMENTATION, optional: true },
        CorePageExtensionAdapter,
      ],
    },
    CorePageLayoutAdapter,
    {
      provide: PAGE_LAYOUT_PORT,
      useFactory: (platform: PageLayoutPort | undefined, core: CorePageLayoutAdapter) =>
        platform ?? core,
      inject: [
        { token: PAGE_LAYOUT_IMPLEMENTATION, optional: true },
        CorePageLayoutAdapter,
      ],
    },
    CorePageReusableAdapter,
    {
      provide: PAGE_REUSABLE_PORT,
      useFactory: (
        platform: PageReusablePort | undefined,
        core: CorePageReusableAdapter,
      ) => platform ?? core,
      inject: [
        { token: PAGE_REUSABLE_IMPLEMENTATION, optional: true },
        CorePageReusableAdapter,
      ],
    },
    CorePageCollectionAdapter,
    {
      provide: PAGE_COLLECTION_PORT,
      useFactory: (
        platform: PageCollectionPort | undefined,
        core: CorePageCollectionAdapter,
      ) => platform ?? core,
      inject: [
        { token: PAGE_COLLECTION_IMPLEMENTATION, optional: true },
        CorePageCollectionAdapter,
      ],
    },
    {
      provide: PAGE_PUBLISH_COMPATIBILITY,
      useFactory: (platform: PagePublishCompatibility | undefined) => platform,
      inject: [{ token: PAGE_PUBLISH_COMPATIBILITY_IMPLEMENTATION, optional: true }],
    },
  ],
  exports: [
    PageService,
    PAGE_NAVIGATION_PORT,
    PAGE_EXTENSION_PORT,
    PAGE_LAYOUT_PORT,
    PAGE_REUSABLE_PORT,
    PAGE_COLLECTION_PORT,
    PAGE_PUBLISH_COMPATIBILITY,
  ],
})
export class PagesModule {}

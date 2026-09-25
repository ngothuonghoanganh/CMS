import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { SecurityModule } from '../security/security.module';
import { CoreEventsModule } from '../shared/events/core-events.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { CapabilityRegistry } from './capability-registry';
import { ContributionRegistry } from './contribution-registry';
import {
  DemoAnalyticsExtension,
  DemoWebhookExtension,
  demoBuilderExtension,
} from './demo-extensions';
import {
  ExtensionRegistry,
  PLATFORM_EXTENSIONS,
  type PlatformExtension,
} from './extension-registry';
import { ExtensionController } from './extension.controller';
import { ExtensionConnectionController } from './extension-connection.controller';
import { ExtensionConnectionService } from './extension-connection.service';
import { TenantExtensionService } from './tenant-extension.service';
import { PageExtensionController } from './page-extension.controller';
import { PageExtensionService } from './page-extension.service';
import { LegacyExtensionEventBridge } from './legacy-extension-event-bridge';
import { PAGE_EXTENSION_PORT } from '../shared/page-extension-port';

export const PAGE_EXTENSION_PORT_PROVIDER = {
  provide: PAGE_EXTENSION_PORT,
  useExisting: PageExtensionService,
} as const;

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    CoreEventsModule,
    TenantModelsModule,
    TenantModule,
  ],
  controllers: [
    ExtensionController,
    ExtensionConnectionController,
    PageExtensionController,
  ],
  providers: [
    CapabilityRegistry,
    ContributionRegistry,
    DemoAnalyticsExtension,
    DemoWebhookExtension,
    {
      provide: PLATFORM_EXTENSIONS,
      useFactory: (
        analytics: DemoAnalyticsExtension,
        webhook: DemoWebhookExtension,
      ): PlatformExtension[] => [demoBuilderExtension, analytics, webhook],
      inject: [DemoAnalyticsExtension, DemoWebhookExtension],
    },
    ExtensionRegistry,
    TenantExtensionService,
    ExtensionConnectionService,
    PageExtensionService,
    PAGE_EXTENSION_PORT_PROVIDER,
    LegacyExtensionEventBridge,
  ],
  exports: [
    CapabilityRegistry,
    ContributionRegistry,
    ExtensionRegistry,
    TenantExtensionService,
    PageExtensionService,
    PAGE_EXTENSION_PORT,
  ],
})
export class ExtensionModule {}

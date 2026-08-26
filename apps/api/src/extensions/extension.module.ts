import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { SecurityModule } from '../security/security.module';
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

@Module({
  imports: [AuthenticationModule, SecurityModule, TenantModelsModule, TenantModule],
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
  ],
  exports: [
    CapabilityRegistry,
    ContributionRegistry,
    ExtensionRegistry,
    TenantExtensionService,
    PageExtensionService,
  ],
})
export class ExtensionModule {}

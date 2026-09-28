import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { CoreEventsModule } from '../shared/events/core-events.module';
import { ControlPlaneModule } from '../tenancy/control-plane.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { SecurityModule } from '../security/security.module';
import { AssetModule } from '../modules/assets/asset.module';
import { NavigationModule } from '../modules/navigation/navigation.module';
import { PagesModule } from '../modules/pages/pages.module';
import { PublicDeliveryModule } from '../modules/public-delivery/public-delivery.module';
import { SiteModule } from '../modules/sites/site.module';
import { SubmissionsModule } from '../modules/submissions/submissions.module';
import { WorkspaceModule } from '../modules/workspaces/workspace.module';
import { PlatformCompatibilityModule } from './platform-compatibility.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './analytics-query.service';
import {
  CollectionController,
  WorkspaceCollectionController,
} from './collection.controller';
import { FormIntegrationBindingController } from './form-integration-binding.controller';
import { FormIntegrationBindingService } from './form-integration-binding.service';
import { IntegrationController } from './integration.controller';
import { IntegrationDeliveryController } from './integration-delivery.controller';
import { IntegrationService } from './integration.service';
import {
  LayoutExtensionController,
  WorkspaceLayoutExtensionController,
} from './layout-extension.controller';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

/**
 * Composition boundary for capabilities that are not required by the Core
 * Product. Core ownership lives in the feature modules imported here; the
 * deferred platform implementations are isolated in PlatformCompatibilityModule.
 */
@Module({
  imports: [
    AuthenticationModule,
    ControlPlaneModule,
    SecurityModule,
    CoreEventsModule,
    TenantModelsModule,
    TenantModule,
    AssetModule,
    NavigationModule,
    PagesModule,
    PublicDeliveryModule,
    SiteModule,
    SubmissionsModule,
    WorkspaceModule,
    PlatformCompatibilityModule,
  ],
  controllers: [
    TemplateController,
    IntegrationController,
    IntegrationDeliveryController,
    FormIntegrationBindingController,
    AnalyticsController,
    OrganizationController,
    LayoutExtensionController,
    WorkspaceLayoutExtensionController,
    CollectionController,
    WorkspaceCollectionController,
  ],
  providers: [
    TemplateService,
    IntegrationService,
    FormIntegrationBindingService,
    AnalyticsQueryService,
    OrganizationService,
  ],
})
export class DomainModule {}

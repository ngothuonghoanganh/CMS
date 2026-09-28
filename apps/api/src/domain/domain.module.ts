import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { BillingModule } from '../billing/billing.module';
import { env } from '../config/env';
import { AssetModule } from '../modules/assets/asset.module';
import { NavigationModule } from '../modules/navigation/navigation.module';
import { ReusablesModule } from '../modules/reusables/reusables.module';
import { SiteModule } from '../modules/sites/site.module';
import {
  PageController,
  PreviewPageController,
  PublicPageController,
  SitePagesController,
} from './page.controller';
import { PageService } from './page.service';
import { PublicPageResolver } from './public-page.resolver';
import {
  CustomDomainController,
  PublicDomainController,
} from './custom-domain.controller';
import { CustomDomainService } from './custom-domain.service';
import {
  DOMAIN_VERIFICATION_RESOLVER,
  InMemoryDomainVerificationResolver,
  NodeDomainVerificationResolver,
} from './domain-verification-resolver';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import {
  SubmissionController,
  PublicSubmissionController,
} from './submission.controller';
import { SubmissionService } from './submission.service';
import { IntegrationController } from './integration.controller';
import { IntegrationDeliveryController } from './integration-delivery.controller';
import { IntegrationService } from './integration.service';
import { FormIntegrationBindingController } from './form-integration-binding.controller';
import { FormIntegrationBindingService } from './form-integration-binding.service';
import { INTEGRATION_ADAPTERS, IntegrationDispatcher } from './integration-dispatcher';
import { EmailIntegrationAdapter } from './integrations/email.adapter';
import { WebhookIntegrationAdapter } from './integrations/webhook.adapter';
import { createEmailProvider, EMAIL_PROVIDER } from './integrations/email-provider';
import type { EmailProvider } from './integrations/integration.types';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './analytics-query.service';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { ControlPlaneModule } from '../tenancy/control-plane.module';
import { SecurityModule } from '../security/security.module';
import { CoreEventsModule } from '../shared/events/core-events.module';
import { ExtensionModule } from '../extensions/extension.module';
import { WorkflowModule } from '../workflows/workflow.module';
import {
  LayoutExtensionController,
  WorkspaceLayoutExtensionController,
} from './layout-extension.controller';
import { LayoutExtensionService } from './layout-extension.service';
import {
  CollectionController,
  WorkspaceCollectionController,
} from './collection.controller';
import { CollectionService } from './collection.service';
import {
  PAGE_REUSABLE_PORT_PROVIDER,
  PageReusableAdapter,
} from './page-reusable.adapter';
import {
  PAGE_NAVIGATION_PORT_PROVIDER,
  PageNavigationAdapter,
} from './page-navigation.adapter';
import { PAGE_LAYOUT_PORT_PROVIDER, PageLayoutAdapter } from './page-layout.adapter';
import {
  PAGE_COLLECTION_PORT_PROVIDER,
  PageCollectionAdapter,
} from './page-collection.adapter';
import {
  SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER,
  SubmissionSideEffectsAdapter,
} from './submission-side-effects.adapter';

@Module({
  imports: [
    AuthenticationModule,
    BillingModule,
    ControlPlaneModule,
    SecurityModule,
    CoreEventsModule,
    ExtensionModule,
    WorkflowModule,
    TenantModelsModule,
    TenantModule,
    AssetModule,
    NavigationModule,
    ReusablesModule,
    SiteModule,
  ],
  controllers: [
    PageController,
    PreviewPageController,
    PublicPageController,
    SitePagesController,
    TemplateController,
    WorkspaceController,
    SubmissionController,
    PublicSubmissionController,
    IntegrationController,
    IntegrationDeliveryController,
    FormIntegrationBindingController,
    AnalyticsController,
    CustomDomainController,
    PublicDomainController,
    SeoController,
    OrganizationController,
    LayoutExtensionController,
    WorkspaceLayoutExtensionController,
    CollectionController,
    WorkspaceCollectionController,
  ],
  providers: [
    PageService,
    SubmissionService,
    TemplateService,
    WorkspaceService,
    IntegrationService,
    FormIntegrationBindingService,
    IntegrationDispatcher,
    WebhookIntegrationAdapter,
    AnalyticsRepository,
    AnalyticsService,
    OrganizationService,
    LayoutExtensionService,
    AnalyticsQueryService,
    CustomDomainService,
    PublicPageResolver,
    SeoService,
    PageNavigationAdapter,
    PAGE_NAVIGATION_PORT_PROVIDER,
    PageLayoutAdapter,
    PAGE_LAYOUT_PORT_PROVIDER,
    PageCollectionAdapter,
    PAGE_COLLECTION_PORT_PROVIDER,
    SubmissionSideEffectsAdapter,
    SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER,
    CollectionService,
    PageReusableAdapter,
    PAGE_REUSABLE_PORT_PROVIDER,
    {
      provide: DOMAIN_VERIFICATION_RESOLVER,
      useFactory: () =>
        env.DOMAIN_VERIFICATION_PROVIDER === 'fake'
          ? new InMemoryDomainVerificationResolver()
          : new NodeDomainVerificationResolver(),
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: createEmailProvider,
    },
    {
      provide: EmailIntegrationAdapter,
      useFactory: (provider: EmailProvider) => new EmailIntegrationAdapter(provider),
      inject: [EMAIL_PROVIDER],
    },
    {
      provide: INTEGRATION_ADAPTERS,
      useFactory: (
        emailAdapter: EmailIntegrationAdapter,
        webhookAdapter: WebhookIntegrationAdapter,
      ) => [emailAdapter, webhookAdapter],
      inject: [EmailIntegrationAdapter, WebhookIntegrationAdapter],
    },
  ],
})
export class DomainModule {}

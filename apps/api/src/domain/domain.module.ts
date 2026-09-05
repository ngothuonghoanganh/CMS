import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { BillingModule } from '../billing/billing.module';
import { env } from '../config/env';
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
import { SiteController } from './site.controller';
import { SiteService } from './site.service';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
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
import { ExtensionModule } from '../extensions/extension.module';
import { WorkflowModule } from '../workflows/workflow.module';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';
import {
  LayoutExtensionController,
  WorkspaceLayoutExtensionController,
} from './layout-extension.controller';
import { LayoutExtensionService } from './layout-extension.service';
import { SiteUrlService } from './site-url.service';
import { ReusableController } from './reusable.controller';
import { ReusableService } from './reusable.service';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

@Module({
  imports: [
    AuthenticationModule,
    BillingModule,
    ControlPlaneModule,
    SecurityModule,
    ExtensionModule,
    WorkflowModule,
    TenantModelsModule,
    TenantModule,
  ],
  controllers: [
    AssetController,
    PageController,
    PreviewPageController,
    PublicPageController,
    SitePagesController,
    SiteController,
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
    NavigationController,
    LayoutExtensionController,
    WorkspaceLayoutExtensionController,
    ReusableController,
    CollectionController,
  ],
  providers: [
    AssetService,
    PageService,
    SiteService,
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
    NavigationService,
    LayoutExtensionService,
    SiteUrlService,
    AnalyticsQueryService,
    CustomDomainService,
    PublicPageResolver,
    SeoService,
    ReusableService,
    CollectionService,
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

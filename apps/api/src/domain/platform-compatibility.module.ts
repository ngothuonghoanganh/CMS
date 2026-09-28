import { Global, Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { SubscriptionService } from '../billing/subscription.service';
import { AuthenticationModule } from '../common/guards/authentication.module';
import { AssetReferenceAdapter } from '../modules/assets/asset-reference.adapter';
import { ASSET_REFERENCE_IMPLEMENTATION } from '../shared/asset-reference-port';
import { CUSTOM_DOMAIN_EVENT_IMPLEMENTATION } from '../shared/custom-domain-event-port';
import { CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION } from '../shared/custom-domain-quota-port';
import { CoreEventsModule } from '../shared/events/core-events.module';
import { PAGE_COLLECTION_IMPLEMENTATION } from '../shared/page-collection-port';
import { PAGE_EXTENSION_IMPLEMENTATION } from '../shared/page-extension-port';
import { PAGE_LAYOUT_IMPLEMENTATION } from '../shared/page-layout-port';
import {
  PAGE_PUBLISH_COMPATIBILITY,
  PAGE_PUBLISH_COMPATIBILITY_IMPLEMENTATION,
} from '../shared/page-publish-compatibility';
import { PAGE_REUSABLE_IMPLEMENTATION } from '../shared/page-reusable-port';
import { SEO_COLLECTION_IMPLEMENTATION } from '../shared/seo-collection-port';
import { SITE_REUSABLE_IMPLEMENTATION } from '../shared/site-reusable-port';
import { TENANT_SUBSCRIPTION_PROVISIONER } from '../shared/tenant-subscription-provisioner';
import { ExtensionModule } from '../extensions/extension.module';
import { PageExtensionService } from '../extensions/page-extension.service';
import { WorkflowModule } from '../workflows/workflow.module';
import { NavigationModule } from '../modules/navigation/navigation.module';
import { ReusablesModule } from '../modules/reusables/reusables.module';
import { SiteReusableAdapter } from '../modules/sites/site-reusable.adapter';
import { CustomDomainEventAdapter } from '../modules/public-delivery/custom-domain-event.adapter';
import { CustomDomainQuotaAdapter } from '../modules/public-delivery/custom-domain-quota.adapter';
import { SeoCollectionAdapter } from '../modules/public-delivery/seo-collection.adapter';
import { PageCollectionAdapter } from './page-collection.adapter';
import { PageLayoutAdapter } from './page-layout.adapter';
import { PageReusableAdapter } from './page-reusable.adapter';
import {
  SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER,
  SubmissionSideEffectsAdapter,
  SubmissionSideEffectsSubscriber,
} from './submission-side-effects.adapter';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { CollectionService } from './collection.service';
import { EmailIntegrationAdapter } from './integrations/email.adapter';
import { createEmailProvider, EMAIL_PROVIDER } from './integrations/email-provider';
import { WebhookIntegrationAdapter } from './integrations/webhook.adapter';
import { INTEGRATION_ADAPTERS, IntegrationDispatcher } from './integration-dispatcher';
import { LayoutExtensionService } from './layout-extension.service';
import { SecurityModule } from '../security/security.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import type { EmailProvider } from './integrations/integration.types';

/**
 * Optional platform composition. Core feature modules never import this
 * module; the application composition root may add these implementations to
 * the core-owned ports when the deferred platforms are enabled.
 */
@Global()
@Module({
  imports: [
    AuthenticationModule,
    BillingModule,
    CoreEventsModule,
    ExtensionModule,
    NavigationModule,
    ReusablesModule,
    SecurityModule,
    TenantModelsModule,
    TenantModule,
    WorkflowModule,
  ],
  providers: [
    AssetReferenceAdapter,
    { provide: ASSET_REFERENCE_IMPLEMENTATION, useExisting: AssetReferenceAdapter },
    SiteReusableAdapter,
    { provide: SITE_REUSABLE_IMPLEMENTATION, useExisting: SiteReusableAdapter },
    PageReusableAdapter,
    { provide: PAGE_REUSABLE_IMPLEMENTATION, useExisting: PageReusableAdapter },
    PageLayoutAdapter,
    { provide: PAGE_LAYOUT_IMPLEMENTATION, useExisting: PageLayoutAdapter },
    PageCollectionAdapter,
    { provide: PAGE_COLLECTION_IMPLEMENTATION, useExisting: PageCollectionAdapter },
    SeoCollectionAdapter,
    { provide: SEO_COLLECTION_IMPLEMENTATION, useExisting: SeoCollectionAdapter },
    CustomDomainQuotaAdapter,
    {
      provide: CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION,
      useExisting: CustomDomainQuotaAdapter,
    },
    CustomDomainEventAdapter,
    {
      provide: CUSTOM_DOMAIN_EVENT_IMPLEMENTATION,
      useExisting: CustomDomainEventAdapter,
    },
    {
      provide: PAGE_EXTENSION_IMPLEMENTATION,
      useExisting: PageExtensionService,
    },
    {
      provide: PAGE_PUBLISH_COMPATIBILITY_IMPLEMENTATION,
      useExisting: PAGE_PUBLISH_COMPATIBILITY,
    },
    {
      provide: TENANT_SUBSCRIPTION_PROVISIONER,
      useExisting: SubscriptionService,
    },
    LayoutExtensionService,
    CollectionService,
    AnalyticsRepository,
    AnalyticsService,
    IntegrationDispatcher,
    WebhookIntegrationAdapter,
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
    SubmissionSideEffectsAdapter,
    SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER,
    SubmissionSideEffectsSubscriber,
  ],
  exports: [
    BillingModule,
    ExtensionModule,
    NavigationModule,
    ReusablesModule,
    SecurityModule,
    WorkflowModule,
    ASSET_REFERENCE_IMPLEMENTATION,
    SITE_REUSABLE_IMPLEMENTATION,
    PAGE_REUSABLE_IMPLEMENTATION,
    PAGE_LAYOUT_IMPLEMENTATION,
    PAGE_COLLECTION_IMPLEMENTATION,
    SEO_COLLECTION_IMPLEMENTATION,
    CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION,
    CUSTOM_DOMAIN_EVENT_IMPLEMENTATION,
    PAGE_EXTENSION_IMPLEMENTATION,
    PAGE_PUBLISH_COMPATIBILITY_IMPLEMENTATION,
    TENANT_SUBSCRIPTION_PROVISIONER,
    LayoutExtensionService,
    CollectionService,
    AnalyticsRepository,
    AnalyticsService,
    IntegrationDispatcher,
    SubmissionSideEffectsAdapter,
    SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER,
  ],
})
export class PlatformCompatibilityModule {}

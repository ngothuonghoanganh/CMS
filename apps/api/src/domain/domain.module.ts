import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthenticationModule } from '../common/guards/authentication.module';
import {
  AssetRecord,
  AssetSchema,
  AnalyticsEventRecord,
  AnalyticsEventSchema,
  FormSubmissionRecord,
  FormSubmissionSchema,
  FormIntegrationBindingRecord,
  FormIntegrationBindingSchema,
  IntegrationDeliveryRecord,
  IntegrationDeliverySchema,
  IntegrationRecord,
  IntegrationSchema,
  LandingPageRecord,
  LandingPageSchema,
  PageVersionRecord,
  PageVersionSchema,
  SiteRecord,
  SiteSchema,
  TemplateRecord,
  TemplateSchema,
  WorkspaceRecord,
  WorkspaceSchema,
} from '../persistence/schemas';
import {
  PageController,
  PreviewPageController,
  PublicPageController,
  SitePagesController,
} from './page.controller';
import { PageService } from './page.service';
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

@Module({
  imports: [
    AuthenticationModule,
    MongooseModule.forFeature([
      { name: AssetRecord.name, schema: AssetSchema },
      { name: AnalyticsEventRecord.name, schema: AnalyticsEventSchema },
      { name: FormSubmissionRecord.name, schema: FormSubmissionSchema },
      { name: FormIntegrationBindingRecord.name, schema: FormIntegrationBindingSchema },
      { name: IntegrationDeliveryRecord.name, schema: IntegrationDeliverySchema },
      { name: IntegrationRecord.name, schema: IntegrationSchema },
      { name: LandingPageRecord.name, schema: LandingPageSchema },
      { name: PageVersionRecord.name, schema: PageVersionSchema },
      { name: SiteRecord.name, schema: SiteSchema },
      { name: TemplateRecord.name, schema: TemplateSchema },
      { name: WorkspaceRecord.name, schema: WorkspaceSchema },
    ]),
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
    AnalyticsQueryService,
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

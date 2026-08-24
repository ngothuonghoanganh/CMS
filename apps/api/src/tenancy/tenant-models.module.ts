import { Module } from '@nestjs/common';

import {
  AssetRecord,
  AssetSchema,
  AnalyticsEventRecord,
  AnalyticsEventSchema,
  AuthSessionRecord,
  AuthSessionSchema,
  CustomDomainRecord,
  CustomDomainSchema,
  FormIntegrationBindingRecord,
  FormIntegrationBindingSchema,
  FormSubmissionRecord,
  FormSubmissionSchema,
  IntegrationDeliveryRecord,
  IntegrationDeliverySchema,
  IntegrationRecord,
  IntegrationSchema,
  LandingPageRecord,
  LandingPageSchema,
  PageSeoSettingsRecord,
  PageSeoSettingsSchema,
  PageVersionRecord,
  PageVersionSchema,
  SiteRecord,
  SiteSchema,
  TemplateRecord,
  TemplateSchema,
  WorkspaceRecord,
  WorkspaceSchema,
} from '../persistence/schemas';
import { TenantUserRecord, TenantUserSchema } from './schemas/tenant-user.schema';
import {
  TenantMembershipRecord,
  TenantMembershipSchema,
} from './schemas/tenant-membership.schema';
import { tenantModelProvider } from './tenant-model.providers';
import { TenantModule } from './tenant.module';
import type { Schema } from 'mongoose';

const models = [
  [AssetRecord, AssetSchema],
  [AnalyticsEventRecord, AnalyticsEventSchema],
  [AuthSessionRecord, AuthSessionSchema],
  [CustomDomainRecord, CustomDomainSchema],
  [FormIntegrationBindingRecord, FormIntegrationBindingSchema],
  [FormSubmissionRecord, FormSubmissionSchema],
  [IntegrationDeliveryRecord, IntegrationDeliverySchema],
  [IntegrationRecord, IntegrationSchema],
  [LandingPageRecord, LandingPageSchema],
  [PageSeoSettingsRecord, PageSeoSettingsSchema],
  [PageVersionRecord, PageVersionSchema],
  [SiteRecord, SiteSchema],
  [TemplateRecord, TemplateSchema],
  [WorkspaceRecord, WorkspaceSchema],
  [TenantUserRecord, TenantUserSchema],
  [TenantMembershipRecord, TenantMembershipSchema],
] as const;

const providers = models.map(([record, schema]) =>
  tenantModelProvider(record.name, schema as unknown as Schema<unknown>),
);

@Module({
  exports: providers,
  imports: [TenantModule],
  providers,
})
export class TenantModelsModule {}

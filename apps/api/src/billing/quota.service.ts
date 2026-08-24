import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  BillingEntitlementsResponseSchema,
  BillingSummarySchema,
  BillingUsageResponseSchema,
  type BillingEntitlementsResponse,
  type BillingSummary,
  type BillingUsageMetric,
  type PlanEntitlements,
  type BillingUsageResponse,
} from '@payload/contracts';

import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import { IntegrationRecord } from '../persistence/schemas/integration.schema';
import { LandingPageRecord } from '../persistence/schemas/landing-page.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { currentUtcMonth, SubscriptionService } from './subscription.service';
import { UsageService } from './usage.service';

type HardQuotaMetric = 'workspaces' | 'landing_pages' | 'custom_domains' | 'integrations';

const hardMetricToEntitlement: Record<HardQuotaMetric, keyof PlanEntitlements> = {
  workspaces: 'maxWorkspaces',
  landing_pages: 'maxLandingPages',
  custom_domains: 'maxCustomDomains',
  integrations: 'maxIntegrations',
};

const resourceMetricToModel = {
  workspaces: 'workspace',
  landing_pages: 'page',
  custom_domains: 'domain',
  integrations: 'integration',
} as const;

@Injectable()
export class QuotaService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @InjectModel(LandingPageRecord.name)
    private readonly pageModel: Model<LandingPageRecord>,
    @InjectModel(CustomDomainRecord.name)
    private readonly domainModel: Model<CustomDomainRecord>,
    @InjectModel(IntegrationRecord.name)
    private readonly integrationModel: Model<IntegrationRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async withHardQuota<T>(
    metric: HardQuotaMetric,
    operation: () => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantContext.require().id;
    const key = `${tenantId}:${metric}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      await this.assertCanCreate(metric, tenantId);
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }

  async assertCanCreate(
    metric: HardQuotaMetric,
    tenantId = this.tenantContext.require().id,
  ) {
    const { plan } = await this.subscriptions.getCurrent(tenantId);
    const usage = await this.resourceUsage(metric);
    const limit = plan.entitlements[hardMetricToEntitlement[metric]];
    if (limit !== null && usage >= limit) {
      throw new ConflictException({
        code: 'QUOTA_EXCEEDED',
        message: `${resourceMetricToModel[metric]} quota has been reached for the current plan`,
        details: { metric, limit, usage },
      });
    }
  }

  async getEntitlements(
    tenantId = this.tenantContext.require().id,
  ): Promise<BillingEntitlementsResponse> {
    const { plan } = await this.subscriptions.getCurrent(tenantId);
    return BillingEntitlementsResponseSchema.parse({
      tenantId,
      planId: plan.id,
      planKey: plan.key,
      entitlements: plan.entitlements,
    });
  }

  async getUsage(
    tenantId = this.tenantContext.require().id,
  ): Promise<BillingUsageResponse> {
    const { plan } = await this.subscriptions.getCurrent(tenantId);
    const { start, end } = currentUtcMonth();
    const [workspaces, pages, domains, integrations, periodic] = await Promise.all([
      this.workspaceModel.countDocuments({}).exec(),
      this.pageModel.countDocuments({}).exec(),
      this.domainModel.countDocuments({}).exec(),
      this.integrationModel.countDocuments({}).exec(),
      this.usage.listForCurrentPeriod(tenantId),
    ]);
    const periodicValues = new Map(
      periodic.map((record) => [record.metric, record.value]),
    );
    const values: Record<BillingUsageMetric, number> = {
      workspaces,
      landing_pages: pages,
      custom_domains: domains,
      integrations,
      page_views_monthly: periodicValues.get('page_views_monthly') ?? 0,
      form_submissions_monthly: periodicValues.get('form_submissions_monthly') ?? 0,
    };
    const limits: Record<BillingUsageMetric, number | null> = {
      workspaces: plan.entitlements.maxWorkspaces,
      landing_pages: plan.entitlements.maxLandingPages,
      custom_domains: plan.entitlements.maxCustomDomains,
      integrations: plan.entitlements.maxIntegrations,
      page_views_monthly: plan.entitlements.monthlyPageViews,
      form_submissions_monthly: plan.entitlements.monthlyFormSubmissions,
    };
    return BillingUsageResponseSchema.parse({
      tenantId,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      items: (Object.keys(values) as BillingUsageMetric[]).map((metric) => ({
        metric,
        value: values[metric],
        limit: limits[metric],
        enforcement: metric.endsWith('_monthly') ? 'soft' : 'hard',
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      })),
    });
  }

  async getSummary(tenantId = this.tenantContext.require().id): Promise<BillingSummary> {
    const subscription = await this.subscriptions.getCurrent(tenantId);
    const usage = await this.getUsage(tenantId);
    return BillingSummarySchema.parse({ ...subscription, usage });
  }

  private async resourceUsage(metric: HardQuotaMetric): Promise<number> {
    switch (metric) {
      case 'workspaces':
        return this.workspaceModel.countDocuments({}).exec();
      case 'landing_pages':
        return this.pageModel.countDocuments({}).exec();
      case 'custom_domains':
        return this.domainModel.countDocuments({}).exec();
      case 'integrations':
        return this.integrationModel.countDocuments({}).exec();
    }
  }
}

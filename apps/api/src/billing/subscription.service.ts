import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  AssignSubscriptionRequestSchema,
  EntityIdSchema,
  SubscriptionStatusResponseSchema,
  TenantSubscriptionSchema,
  type AssignSubscriptionRequest,
  type Plan,
  type SubscriptionStatusResponse,
  type TenantSubscription,
} from '@payload/contracts';

import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { TenantRecord } from '../tenancy/schemas/tenant.schema';
import { BillingEventRecord } from './schemas/billing-event.schema';
import {
  TenantSubscriptionRecord,
  type TenantSubscriptionDocument,
} from './schemas/tenant-subscription.schema';
import { PlanService } from './plan.service';

export const CURRENT_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due'] as const;

@Injectable()
export class SubscriptionService {
  private readonly assignments = new Map<string, Promise<TenantSubscription>>();

  constructor(
    @InjectModel(TenantSubscriptionRecord.name, MASTER_CONNECTION)
    private readonly subscriptionModel: Model<TenantSubscriptionRecord>,
    @InjectModel(TenantRecord.name, MASTER_CONNECTION)
    private readonly tenantModel: Model<TenantRecord>,
    @InjectModel(BillingEventRecord.name, MASTER_CONNECTION)
    private readonly billingEventModel: Model<BillingEventRecord>,
    @Inject(PlanService) private readonly plans: PlanService,
  ) {}

  async ensureDefaultForTenant(
    tenantId: string,
    planKey: string,
  ): Promise<TenantSubscription> {
    await this.plans.ensureSeeded();
    const existing = await this.findCurrent(tenantId);
    if (existing) return this.toContract(existing);
    return this.assign(tenantId, { planKey, status: 'active' });
  }

  async assign(
    tenantId: string,
    input: AssignSubscriptionRequest,
  ): Promise<TenantSubscription> {
    if (!EntityIdSchema.safeParse(tenantId).success) throw this.tenantNotFound();
    await this.plans.ensureSeeded();
    const parsed = AssignSubscriptionRequestSchema.parse(input);
    const existing = this.assignments.get(tenantId);
    if (existing) return existing;
    const operation = this.assignInternal(tenantId, parsed).finally(() => {
      if (this.assignments.get(tenantId) === operation) this.assignments.delete(tenantId);
    });
    this.assignments.set(tenantId, operation);
    return operation;
  }

  async getCurrent(tenantId: string): Promise<SubscriptionStatusResponse> {
    const subscription = await this.findCurrent(tenantId);
    if (!subscription) {
      throw new ServiceUnavailableException({
        code: 'BILLING_SUBSCRIPTION_REQUIRED',
        message: 'A billing subscription is not available for this tenant',
      });
    }
    const plan = await this.plans.getById(subscription.planId, { requireActive: false });
    return SubscriptionStatusResponseSchema.parse({
      subscription: this.toContract(subscription),
      plan,
    });
  }

  async getCurrentSubscription(tenantId: string): Promise<TenantSubscription> {
    return (await this.getCurrent(tenantId)).subscription;
  }

  private async assignInternal(
    tenantId: string,
    input: AssignSubscriptionRequest,
  ): Promise<TenantSubscription> {
    const tenant = await this.tenantModel.findById(tenantId).select('_id').exec();
    if (!tenant) throw this.tenantNotFound();
    const plan = await this.plans.getByKey(input.planKey, { requireActive: true });
    const { start, end } = periodFromInput(input);

    await this.subscriptionModel
      .updateMany(
        { tenantId, status: { $in: CURRENT_SUBSCRIPTION_STATUSES } },
        { $set: { status: 'canceled', cancelAtPeriodEnd: false } },
      )
      .exec();

    let record: TenantSubscriptionDocument;
    try {
      record = await this.subscriptionModel.create({
        _id: randomUUID(),
        tenantId,
        planId: plan.id,
        status: input.status,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        provider: 'manual',
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          code: 'ACTIVE_SUBSCRIPTION_EXISTS',
          message: 'The tenant already has a current subscription',
        });
      }
      throw error;
    }
    await this.recordEvent(record, plan);
    return this.toContract(record);
  }

  private async findCurrent(
    tenantId: string,
  ): Promise<TenantSubscriptionDocument | null> {
    return this.subscriptionModel
      .findOne({ tenantId, status: { $in: CURRENT_SUBSCRIPTION_STATUSES } })
      .sort({ updatedAt: -1, _id: -1 })
      .exec();
  }

  private async recordEvent(
    record: TenantSubscriptionDocument,
    plan: Plan,
  ): Promise<void> {
    await this.billingEventModel
      .updateOne(
        { idempotencyKey: `subscription:${record._id.toString()}` },
        {
          $setOnInsert: {
            _id: randomUUID(),
            tenantId: record.tenantId,
            eventType: 'subscription.created',
            idempotencyKey: `subscription:${record._id.toString()}`,
            provider: 'manual',
            metadata: { planKey: plan.key, subscriptionId: record._id.toString() },
            occurredAt: new Date(),
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  private toContract(record: TenantSubscriptionDocument): TenantSubscription {
    return TenantSubscriptionSchema.parse({
      id: record._id.toString(),
      tenantId: record.tenantId,
      planId: record.planId,
      status: record.status,
      currentPeriodStart: record.currentPeriodStart.toISOString(),
      currentPeriodEnd: record.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      provider: record.provider,
      ...(record.providerCustomerId
        ? { providerCustomerId: record.providerCustomerId }
        : {}),
      ...(record.providerSubscriptionId
        ? { providerSubscriptionId: record.providerSubscriptionId }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private tenantNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'TENANT_NOT_FOUND',
      message: 'The requested tenant was not found',
    });
  }
}

function periodFromInput(input: AssignSubscriptionRequest): { start: Date; end: Date } {
  if (input.currentPeriodStart && input.currentPeriodEnd) {
    return {
      start: new Date(input.currentPeriodStart),
      end: new Date(input.currentPeriodEnd),
    };
  }
  return currentUtcMonth();
}

export function currentUtcMonth(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}

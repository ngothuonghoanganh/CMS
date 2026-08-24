import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreatePlanRequestSchema,
  EntityIdSchema,
  PlanListResponseSchema,
  PlanSchema,
  UpdatePlanRequestSchema,
  type CreatePlanRequest,
  type Plan,
  type PlanEntitlements,
  type UpdatePlanRequest,
} from '@payload/contracts';

import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { PlanRecord, type PlanDocument } from './schemas/plan.schema';

const seededPlans: Array<{
  key: string;
  name: string;
  entitlements: PlanEntitlements;
}> = [
  {
    key: 'legacy',
    name: 'Legacy',
    entitlements: {
      maxWorkspaces: null,
      maxLandingPages: null,
      maxCustomDomains: null,
      maxIntegrations: null,
      monthlyPageViews: null,
      monthlyFormSubmissions: null,
    },
  },
  {
    key: 'free',
    name: 'Free',
    entitlements: {
      maxWorkspaces: 3,
      maxLandingPages: 10,
      maxCustomDomains: 1,
      maxIntegrations: 3,
      monthlyPageViews: 1_000,
      monthlyFormSubmissions: 500,
    },
  },
  {
    key: 'starter',
    name: 'Starter',
    entitlements: {
      maxWorkspaces: 5,
      maxLandingPages: 50,
      maxCustomDomains: 3,
      maxIntegrations: 10,
      monthlyPageViews: 10_000,
      monthlyFormSubmissions: 5_000,
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    entitlements: {
      maxWorkspaces: 20,
      maxLandingPages: 100,
      maxCustomDomains: 10,
      maxIntegrations: 20,
      monthlyPageViews: 100_000,
      monthlyFormSubmissions: 50_000,
    },
  },
  {
    key: 'business',
    name: 'Business',
    entitlements: {
      maxWorkspaces: null,
      maxLandingPages: null,
      maxCustomDomains: null,
      maxIntegrations: null,
      monthlyPageViews: 1_000_000,
      monthlyFormSubmissions: 500_000,
    },
  },
];

@Injectable()
export class PlanService {
  private seedPromise: Promise<void> | null = null;

  constructor(
    @InjectModel(PlanRecord.name, MASTER_CONNECTION)
    private readonly planModel: Model<PlanRecord>,
  ) {}

  async ensureSeeded(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = Promise.all(
        seededPlans.map((plan) =>
          this.planModel
            .updateOne(
              { key: plan.key },
              {
                $setOnInsert: {
                  _id: randomUUID(),
                  ...plan,
                  status: 'active',
                },
              },
              { upsert: true, setDefaultsOnInsert: true },
            )
            .exec(),
        ),
      )
        .then(() => undefined)
        .catch((error) => {
          this.seedPromise = null;
          throw error;
        });
    }
    await this.seedPromise;
  }

  async list(): Promise<{ items: Plan[] }> {
    await this.ensureSeeded();
    const records = await this.planModel.find().sort({ key: 1, _id: 1 }).exec();
    return PlanListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async create(input: CreatePlanRequest): Promise<Plan> {
    const parsed = CreatePlanRequestSchema.parse(input);
    const record = await this.planModel.create({ _id: randomUUID(), ...parsed });
    return this.toContract(record);
  }

  async getById(id: string, options: { requireActive?: boolean } = {}): Promise<Plan> {
    if (!EntityIdSchema.safeParse(id).success) throw this.notFound();
    const record = await this.planModel.findById(id).exec();
    if (!record || (options.requireActive && record.status !== 'active')) {
      throw this.notFound();
    }
    return this.toContract(record);
  }

  async getByKey(key: string, options: { requireActive?: boolean } = {}): Promise<Plan> {
    const record = await this.planModel.findOne({ key: key.trim().toLowerCase() }).exec();
    if (!record || (options.requireActive && record.status !== 'active')) {
      throw this.notFound();
    }
    return this.toContract(record);
  }

  async update(id: string, input: UpdatePlanRequest): Promise<Plan> {
    if (!EntityIdSchema.safeParse(id).success) throw this.notFound();
    const parsed = UpdatePlanRequestSchema.parse(input);
    const record = await this.planModel.findById(id).exec();
    if (!record) throw this.notFound();
    if (parsed.status === 'inactive' || parsed.status === 'archived') {
      const activeSubscription = await this.planModel.db
        .collection('tenantSubscriptions')
        .findOne({ planId: id, status: { $in: ['trialing', 'active', 'past_due'] } });
      if (activeSubscription) {
        throw new ConflictException({
          code: 'PLAN_IN_USE',
          message: 'A plan used by an active subscription cannot be deactivated',
        });
      }
    }
    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.entitlements !== undefined) record.entitlements = parsed.entitlements;
    if (parsed.status !== undefined) record.status = parsed.status;
    await record.save();
    return this.toContract(record);
  }

  toContract(record: PlanDocument): Plan {
    return PlanSchema.parse({
      id: record._id.toString(),
      key: record.key,
      name: record.name,
      status: record.status,
      entitlements: record.entitlements,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PLAN_NOT_FOUND',
      message: 'The requested plan was not found',
    });
  }
}

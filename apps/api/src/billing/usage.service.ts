import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import { TenantUsageSchema, type TenantUsage } from '@payload/contracts';

import { MASTER_CONNECTION } from '../tenancy/master-connection';
import {
  TenantUsageRecord,
  type TenantUsageDocument,
} from './schemas/tenant-usage.schema';
import { currentUtcMonth } from './subscription.service';

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(TenantUsageRecord.name, MASTER_CONNECTION)
    private readonly usageModel: Model<TenantUsageRecord>,
  ) {}

  async increment(
    tenantId: string,
    metric: 'page_views_monthly' | 'form_submissions_monthly',
    amount = 1,
    occurredAt = new Date(),
  ): Promise<TenantUsage> {
    const { start, end } = currentUtcMonth(occurredAt);
    const record = await this.usageModel
      .findOneAndUpdate(
        { tenantId, metric, periodStart: start },
        {
          $inc: { value: amount },
          $setOnInsert: {
            _id: randomUUID(),
            tenantId,
            metric,
            periodStart: start,
            periodEnd: end,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!record) throw new Error('Failed to update tenant usage');
    return this.toContract(record);
  }

  async listForCurrentPeriod(tenantId: string): Promise<TenantUsage[]> {
    const { start } = currentUtcMonth();
    const records = await this.usageModel
      .find({ tenantId, periodStart: start })
      .sort({ metric: 1 })
      .exec();
    return records.map((record) => this.toContract(record));
  }

  toContract(record: TenantUsageDocument): TenantUsage {
    return TenantUsageSchema.parse({
      id: record._id.toString(),
      tenantId: record.tenantId,
      metric: record.metric,
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      value: record.value,
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
